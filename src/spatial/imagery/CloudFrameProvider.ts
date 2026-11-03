// A Cesium imagery provider for one moment of the live cloud layer: each tile is stitched
// from the geostationary satellites that see it (cloudImagery.SATELLITES), every pixel
// decoded to its infrared brightness temperature and drawn as white cloud with the
// opacity cloudOpacity() gives it. Under realistic lighting the same tile also carries the
// clouds' shadows (cloudShadowTile.ts) beneath them, so one layer draws both. One provider
// per frame time; CloudLayer shows and crossfades them.

import { Event, WebMercatorTilingScheme, type Credit } from 'cesium';
import { sampleBilinear, tileXToLon } from '../terrain/terrarium';
import { satelliteFor } from './cloudImagery';
import { subsolarPoint } from './cloudShadow';
import { shadowAlpha } from './cloudShadowTile';
import { CLOUD_MAX_LEVEL, EUMETSAT_MAX_LEVEL, sourceOpacity, TILE } from './cloudSources';

export { CLOUD_MAX_LEVEL } from './cloudSources';

export class CloudFrameProvider {
  readonly tilingScheme = new WebMercatorTilingScheme();
  readonly rectangle = this.tilingScheme.rectangle;
  readonly tileWidth = TILE;
  readonly tileHeight = TILE;
  readonly minimumLevel = 0;
  readonly maximumLevel = CLOUD_MAX_LEVEL;
  readonly tileDiscardPolicy = undefined;
  readonly errorEvent = new Event();
  readonly hasAlphaChannel = true;
  readonly proxy = undefined;
  /** Tiles still being fetched for this frame, and tiles drawn so far. */
  pending = 0;
  completed = 0;
  private readonly sun: { lat: number; lon: number };

  constructor(
    /** Frame time, ISO 8601 UTC. */
    readonly time: string,
    readonly credit: Credit,
    /** Request priority: the newest frame loads first. */
    private readonly priority: number,
    /** Draw the clouds' shadows beneath them (realistic lighting). */
    readonly shadows: boolean,
  ) {
    this.sun = subsolarPoint(new Date(time));
  }

  getTileCredits(): undefined {
    return undefined;
  }

  pickFeatures(): undefined {
    return undefined;
  }

  async requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    this.pending++;
    try {
      const [cloud, shadow] = await Promise.all([
        this.cloudAlpha(x, y, level),
        this.shadows ? shadowAlpha(this.time, this.sun, x, y, level, this.priority) : null,
      ]);
      this.completed++;
      return composite(cloud, shadow);
    } finally {
      this.pending--;
    }
  }

  /** Cloud opacity (0–255) for each pixel of a tile. */
  private async cloudAlpha(x: number, y: number, level: number): Promise<Uint8Array> {
    // Which satellite draws each pixel column of this tile.
    const columns = Array.from({ length: TILE }, (_, px) =>
      satelliteFor(tileXToLon(x + (px + 0.5) / TILE, level)),
    );
    const satellites = [...new Set(columns)];
    const sources = new Map(
      await Promise.all(
        satellites.map(async (s) => {
          const z = s.source.kind === 'eumetsat' ? Math.min(level, EUMETSAT_MAX_LEVEL) : level;
          const shift = level - z;
          const grid = await sourceOpacity(
            s.source,
            this.time,
            x >> shift,
            y >> shift,
            z,
            this.priority,
          );
          // This tile's offset and scale within the (possibly coarser) source tile.
          const scale = 2 ** shift;
          const ox = (x - ((x >> shift) << shift)) * TILE;
          const oy = (y - ((y >> shift) << shift)) * TILE;
          return [s, { grid, scale, ox, oy }] as const;
        }),
      ),
    );
    const alpha = new Uint8Array(TILE * TILE);
    for (let px = 0; px < TILE; px++) {
      const source = sources.get(columns[px]!);
      if (!source?.grid) continue;
      const u = (source.ox + px + 0.5) / source.scale;
      for (let py = 0; py < TILE; py++)
        alpha[py * TILE + px] =
          source.scale === 1
            ? source.grid[py * TILE + px]!
            : sampleBilinear(source.grid, TILE, u, (source.oy + py + 0.5) / source.scale);
    }
    return alpha;
  }
}

/** White cloud over black shadow, as one straight-alpha tile. */
function composite(cloud: Uint8Array, shadow: Uint8Array | null): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < cloud.length; i++) {
    const c = cloud[i]! / 255;
    const s = shadow ? shadow[i]! / 255 : 0;
    const a = c + s * (1 - c);
    if (a === 0) continue;
    const grey = Math.round((255 * c) / a);
    const j = i * 4;
    out.data[j] = out.data[j + 1] = out.data[j + 2] = grey;
    out.data[j + 3] = Math.round(255 * a);
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
