// A CesiumJS TerrainProvider backed by Terrarium elevation tiles.
//
// Why this exists: Cesium consumes quantized-mesh or heightmap terrain on a geographic
// (EPSG:4326) quadtree; Terrarium is a PNG encoding on a Web Mercator (EPSG:3857) grid.
// Rendering Mercator terrain directly leaves holes at the poles (Mercator stops at
// ±85.05°), so each geographic tile is produced by bilinearly resampling the Mercator
// tile(s) that cover it at an equivalent sample spacing. Heights are converted from the
// sources' sea-level reference to WGS84 ellipsoidal heights with EGM96 (h = H + N), which
// is what Cesium's globe expects.
//
// What it deliberately does not do: invent detail. Beyond the deepest Terrarium zoom (15)
// Cesium upsamples the parent mesh — an interpolation, visibly smooth — rather than this
// provider synthesising heights. Polar caps beyond ±85.05°, where Terrarium has no data,
// are filled by extending the last available row; the inspector reports those points as
// having no terrain data rather than quoting the fill.

import {
  Credit,
  Ellipsoid,
  Event,
  GeographicTilingScheme,
  HeightmapTerrainData,
  Math as CesiumMath,
  Rectangle,
  RequestState,
  TerrainProvider,
  type Request,
  type TileProviderError,
  type TilingScheme,
} from 'cesium';
import { isAbortError } from '../../core/net/RequestQueue';
import { geoidStatus, geoidUndulation, loadGeoid } from '../geoid/egm96';
import {
  lonLatToTileFraction,
  MERCATOR_MAX_LATITUDE,
  sampleBilinear,
  TERRARIUM_TILE_SIZE,
  wrapTileX,
} from './terrarium';
import {
  type DecodedTerrainTile,
  INSPECTION_PRIORITY,
  TerrariumTileSource,
} from './TerrariumTileSource';

const HEIGHTMAP_SIZE = 65;

export interface TerrainActivity {
  requested: number;
  delivered: number;
  deferred: number;
  cancelled: number;
  failed: number;
  inFlight: number;
  queued: number;
  deepestLevel: number;
}

export class TerrariumTerrainProvider {
  readonly tilingScheme: TilingScheme;
  readonly errorEvent = new Event();
  readonly credit: Credit;
  readonly hasWaterMask = false;
  readonly hasVertexNormals = false;
  readonly availability = undefined;
  /** Geographic quadtree level whose sample spacing matches Terrarium zoom 15. */
  readonly maxLevel: number;
  readonly activity: TerrainActivity = {
    requested: 0,
    delivered: 0,
    deferred: 0,
    cancelled: 0,
    failed: 0,
    inFlight: 0,
    queued: 0,
    deepestLevel: 0,
  };
  /** Raised whenever activity changes (throttled by the consumer). */
  readonly activityChanged = new Event();

  private readonly levelZeroMaximumGeometricError: number;
  private readonly maxQueued: number;

  constructor(
    readonly source: TerrariumTileSource,
    options: { credit: string; ellipsoid?: Ellipsoid; maxQueued?: number },
  ) {
    const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
    this.tilingScheme = new GeographicTilingScheme({ ellipsoid });
    this.credit = new Credit(options.credit, true);
    // Geographic level L has the same longitudinal sample spacing as Mercator zoom L-1.
    this.maxLevel = source.maxZoom + 1;
    this.maxQueued = options.maxQueued ?? 12;
    this.levelZeroMaximumGeometricError =
      TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
        ellipsoid,
        HEIGHTMAP_SIZE,
        this.tilingScheme.getNumberOfXTilesAtLevel(0),
      );
    // Retry transient failures a few times; Cesium otherwise abandons the tile for the
    // session and shows its (coarser) parent there.
    this.errorEvent.addEventListener((error: TileProviderError) => {
      if (error.timesRetried < 2) error.retry = true;
    });
    loadGeoid().catch((error: unknown) => {
      console.error(
        'EGM96 geoid failed to load; terrain is shown without the geoid correction.',
        error,
      );
      this.activityChanged.raiseEvent(this.activity);
    });
    source.queue.subscribe(() => {
      this.activity.inFlight = source.queue.stats.active;
      this.activity.queued = source.queue.stats.queued;
      this.activityChanged.raiseEvent(this.activity);
    });
  }

  getLevelMaximumGeometricError(level: number): number {
    return this.levelZeroMaximumGeometricError / (1 << level);
  }

  getTileDataAvailable(_x: number, _y: number, level: number): boolean {
    return level <= this.maxLevel;
  }

  loadTileDataAvailability(): undefined {
    return undefined;
  }

  requestTileGeometry(
    x: number,
    y: number,
    level: number,
    request?: Request,
  ): Promise<HeightmapTerrainData> | undefined {
    if (geoidStatus() === 'loading') {
      this.activity.deferred++;
      return undefined; // Cesium retries next frame.
    }
    const rect = this.tilingScheme.tileXYToRectangle(x, y, level);
    const zoom = Math.max(0, Math.min(this.source.maxZoom, level - 1));
    const addresses = mercatorTilesCovering(rect, zoom);
    const allCached = addresses.every((a) => this.source.peek(a));
    // Back-pressure: when the network queue is already full, decline and let Cesium ask
    // again next frame. Tiles the camera has moved away from are simply never asked for
    // again, so obsolete work does not pile up.
    if (!allCached && this.source.queue.size >= this.maxQueued) {
      this.activity.deferred++;
      return undefined;
    }
    this.activity.requested++;
    const priority = level; // Deeper (closer, more detailed) tiles first.
    return Promise.all(addresses.map((a) => this.source.load(a, priority)))
      .then((tiles) => {
        const buffer = this.resample(rect, zoom, tiles);
        this.activity.delivered++;
        if (level > this.activity.deepestLevel) this.activity.deepestLevel = level;
        this.activityChanged.raiseEvent(this.activity);
        return new HeightmapTerrainData({
          buffer,
          width: HEIGHTMAP_SIZE,
          height: HEIGHTMAP_SIZE,
          childTileMask: level < this.maxLevel ? 15 : 0,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          // Marks this as a deferral rather than a failure, so Cesium re-requests the
          // tile if (and only if) it is needed again.
          // Request.state is typed read-only, but GlobeSurfaceTile reads it to tell a
          // cancellation (retry later) from a failure (give up on the tile).
          if (request) (request as { state: RequestState }).state = RequestState.CANCELLED;
          this.activity.cancelled++;
        } else {
          this.activity.failed++;
        }
        this.activityChanged.raiseEvent(this.activity);
        throw error;
      });
  }

  /**
   * Abort network work for Mercator tiles that lie entirely outside the given view
   * rectangle (radians), expanded by a margin. Called as the camera moves.
   */
  pruneOutside(view: Rectangle | undefined, marginRadians = CesiumMath.toRadians(2)): number {
    if (!view) return 0;
    const expanded = new Rectangle(
      view.west - marginRadians,
      Math.max(-CesiumMath.PI_OVER_TWO, view.south - marginRadians),
      view.east + marginRadians,
      Math.min(CesiumMath.PI_OVER_TWO, view.north + marginRadians),
    );
    return this.source.queue.abortWhere((tag, _started, priority) => {
      const bounds = tag as [number, number, number, number] | undefined;
      // Work the user asked for (inspections, profiles) is kept even when out of view.
      if (!bounds || priority >= INSPECTION_PRIORITY) return false;
      const tileRect = Rectangle.fromDegrees(bounds[0], bounds[1], bounds[2], bounds[3]);
      return (
        !Rectangle.intersection(tileRect, expanded) &&
        !Rectangle.intersection(tileRect, wrapRectangle(expanded))
      );
    });
  }

  private resample(rect: Rectangle, zoom: number, tiles: DecodedTerrainTile[]): Float32Array {
    const byKey = new Map(tiles.map((t) => [`${t.x}/${t.y}`, t]));
    const out = new Float32Array(HEIGHTMAP_SIZE * HEIGHTMAP_SIZE);
    const west = CesiumMath.toDegrees(rect.west);
    const east = CesiumMath.toDegrees(rect.east);
    const north = CesiumMath.toDegrees(rect.north);
    const south = CesiumMath.toDegrees(rect.south);
    const step = HEIGHTMAP_SIZE - 1;
    for (let j = 0; j < HEIGHTMAP_SIZE; j++) {
      const lat = north - ((north - south) * j) / step;
      const sampleLat = Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, lat));
      for (let i = 0; i < HEIGHTMAP_SIZE; i++) {
        const lon = west + ((east - west) * i) / step;
        const f = lonLatToTileFraction(lon, sampleLat, zoom);
        const tx = Math.min(2 ** zoom - 1, Math.floor(f.x));
        const ty = Math.min(2 ** zoom - 1, Math.floor(f.y));
        const tile = byKey.get(`${wrapTileX(tx, zoom)}/${ty}`);
        const orthometric = tile
          ? sampleBilinear(
              tile.heights,
              TERRARIUM_TILE_SIZE,
              (f.x - tx) * TERRARIUM_TILE_SIZE,
              (f.y - ty) * TERRARIUM_TILE_SIZE,
            )
          : 0;
        out[j * HEIGHTMAP_SIZE + i] = orthometric + geoidUndulation(lat, lon);
      }
    }
    return out;
  }
}

function mercatorTilesCovering(
  rect: Rectangle,
  zoom: number,
): { z: number; x: number; y: number }[] {
  const west = CesiumMath.toDegrees(rect.west);
  const east = CesiumMath.toDegrees(rect.east);
  const north = Math.min(MERCATOR_MAX_LATITUDE, CesiumMath.toDegrees(rect.north));
  const south = Math.max(-MERCATOR_MAX_LATITUDE, CesiumMath.toDegrees(rect.south));
  const max = 2 ** zoom - 1;
  const nw = lonLatToTileFraction(west, north, zoom);
  const se = lonLatToTileFraction(east, south, zoom);
  const x0 = Math.floor(nw.x);
  const x1 = Math.min(max, Math.floor(se.x - 1e-9));
  const y0 = Math.max(0, Math.min(max, Math.floor(nw.y)));
  const y1 = Math.max(0, Math.min(max, Math.floor(se.y - 1e-9)));
  const out: { z: number; x: number; y: number }[] = [];
  for (let y = y0; y <= Math.max(y0, y1); y++) {
    for (let x = x0; x <= Math.max(x0, x1); x++) out.push({ z: zoom, x: wrapTileX(x, zoom), y });
  }
  return out;
}

function wrapRectangle(r: Rectangle): Rectangle {
  // Shift by a full turn so rectangles straddling the antimeridian are compared fairly.
  const shift = r.west < -Math.PI ? 2 * Math.PI : r.east > Math.PI ? -2 * Math.PI : 0;
  return new Rectangle(r.west + shift, r.south, r.east + shift, r.north);
}
