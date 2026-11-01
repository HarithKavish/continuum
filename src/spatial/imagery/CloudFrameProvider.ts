// A Cesium imagery provider for one moment of the live cloud layer: each tile is stitched
// from the geostationary satellites that see it (cloudImagery.SATELLITES), every pixel
// decoded to its infrared brightness temperature and drawn as white cloud with the
// opacity cloudOpacity() gives it. One provider per frame time; CloudLayer animates them.

import { Event, WebMercatorTilingScheme, type Credit } from 'cesium';
import { LruCache } from '../../core/net/LruCache';
import { RequestQueue } from '../../core/net/RequestQueue';
import { sampleBilinear, tileXToLon } from '../terrain/terrarium';
import {
  cloudOpacity,
  eumetsatTemperature,
  gibsTemperature,
  satelliteFor,
  type CloudSource,
} from './cloudImagery';

const TILE = 256;
/** Satellite infrared is ~2 km per pixel at best; deeper tiles would only magnify it. */
export const CLOUD_MAX_LEVEL = 5;
/**
 * EUMETView renders every request on demand and took 1–15 s per 256-pixel tile (measured
 * 2026-11-01), so Meteosat is requested no deeper than this and resampled beyond it.
 */
const EUMETSAT_MAX_LEVEL = 3;
const MERCATOR_HALF = 20037508.342789244;

// Per host, so slow EUMETView requests never hold up GIBS.
const queues = {
  gibs: new RequestQueue('clouds-gibs', 6),
  eumetsat: new RequestQueue('clouds-eumetsat', 6),
};

function sourceUrl(source: CloudSource, time: string, x: number, y: number, z: number): string {
  if (source.kind === 'gibs')
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${source.layer}/default/${time}/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png`;
  const size = (2 * MERCATOR_HALF) / 2 ** z;
  const minX = -MERCATOR_HALF + x * size;
  const maxY = MERCATOR_HALF - y * size;
  const bbox = [minX, maxY - size, minX + size, maxY].join(',');
  return `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=${source.layer}&styles=&crs=EPSG:3857&bbox=${bbox}&width=${TILE}&height=${TILE}&format=image/png&time=${time}`;
}

// Decoded source tiles, one byte of opacity per pixel (64 KB each): a coarse Meteosat tile
// serves every deeper tile under it, and every frame of the loop is redrawn as the view moves.
const cache = new LruCache<Uint8Array>(400);

/** A source tile decoded to cloud opacity (0–255) per pixel, or null where it has none. */
async function sourceOpacity(
  source: CloudSource,
  url: string,
  priority: number,
): Promise<Uint8Array | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  const grid = await queues[source.kind].enqueue(
    url,
    async (signal) => {
      const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
      // A failed request is not an absence of cloud: throw, so the imagery layer retries
      // the tile, and cache nothing. A WMS exception (a time not yet published) means no
      // data for now, and is not cached either.
      if (!response.ok) throw new Error(`Cloud tile: HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.startsWith('image/')) return null;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = Object.assign(document.createElement('canvas'), {
        width: TILE,
        height: TILE,
      });
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, TILE, TILE);
      bitmap.close();
      const px = ctx.getImageData(0, 0, TILE, TILE).data;
      const opacity = new Uint8Array(TILE * TILE);
      for (let i = 0; i < opacity.length; i++) {
        const j = i * 4;
        opacity[i] = Math.round(
          255 *
            cloudOpacity(
              source.kind === 'gibs'
                ? gibsTemperature(px[j]!, px[j + 1]!, px[j + 2]!, px[j + 3]!)
                : eumetsatTemperature(px[j]!),
            ),
        );
      }
      return opacity;
    },
    priority,
  );
  if (grid) cache.set(url, grid);
  return grid;
}

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

  constructor(
    /** Frame time, ISO 8601 UTC. */
    readonly time: string,
    readonly credit: Credit,
    /** Request priority: the newest frame loads first. */
    private readonly priority: number,
  ) {}

  getTileCredits(): undefined {
    return undefined;
  }

  pickFeatures(): undefined {
    return undefined;
  }

  async requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    this.pending++;
    try {
      const canvas = await this.draw(x, y, level);
      this.completed++;
      return canvas;
    } finally {
      this.pending--;
    }
  }

  private async draw(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
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
            sourceUrl(s.source, this.time, x >> shift, y >> shift, z),
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
    const canvas = Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(TILE, TILE);
    for (let px = 0; px < TILE; px++) {
      const source = sources.get(columns[px]!);
      if (!source?.grid) continue;
      const u = (source.ox + px + 0.5) / source.scale;
      for (let py = 0; py < TILE; py++) {
        const i = (py * TILE + px) * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
        out.data[i + 3] =
          source.scale === 1
            ? source.grid[py * TILE + px]!
            : sampleBilinear(source.grid, TILE, u, (source.oy + py + 0.5) / source.scale);
      }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }
}
