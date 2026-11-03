// The satellite tiles behind the live clouds: where each is fetched from, and each decoded
// once to one byte of cloud opacity per pixel, held in memory only. The cloud frames and
// their shadows draw from the same decoded tiles, so neither fetches anything twice.

import { LruCache } from '../../core/net/LruCache';
import { RequestQueue } from '../../core/net/RequestQueue';
import {
  cloudOpacity,
  eumetsatTemperature,
  gibsTemperature,
  type CloudSource,
} from './cloudImagery';

export const TILE = 256;
/** Satellite infrared is ~2 km per pixel at best; deeper tiles would only magnify it. */
export const CLOUD_MAX_LEVEL = 5;
/**
 * EUMETView renders every request on demand and took 1–15 s per 256-pixel tile (measured
 * 2026-11-01), so Meteosat is requested no deeper than this and resampled beyond it.
 */
export const EUMETSAT_MAX_LEVEL = 3;
const MERCATOR_HALF = 20037508.342789244;

// Per host, so slow EUMETView requests never hold up GIBS.
const queues = {
  gibs: new RequestQueue('clouds-gibs', 6),
  eumetsat: new RequestQueue('clouds-eumetsat', 6),
};

export function sourceUrl(
  source: CloudSource,
  time: string,
  x: number,
  y: number,
  z: number,
): string {
  if (source.kind === 'gibs')
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${source.layer}/default/${time}/GoogleMapsCompatible_Level6/${z}/${y}/${x}.png`;
  const size = (2 * MERCATOR_HALF) / 2 ** z;
  const minX = -MERCATOR_HALF + x * size;
  const maxY = MERCATOR_HALF - y * size;
  const bbox = [minX, maxY - size, minX + size, maxY].join(',');
  return `https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=${source.layer}&styles=&crs=EPSG:3857&bbox=${bbox}&width=${TILE}&height=${TILE}&format=image/png&time=${time}`;
}

// 64 KB each. The default view shows one frame, so a few dozen tiles cover it; replaying
// the last hours multiplies that by the number of frames.
const cache = new LruCache<Uint8Array>(160);

/**
 * A source tile decoded to cloud opacity (0–255) per pixel, or null where it has none.
 * Jobs are tagged with the frame time, so a frame that is no longer shown can cancel the
 * ones it no longer needs (cancelFrame).
 */
export async function sourceOpacity(
  source: CloudSource,
  time: string,
  x: number,
  y: number,
  z: number,
  priority: number,
): Promise<Uint8Array | null> {
  const url = sourceUrl(source, time, x, y, z);
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
    time,
  );
  if (grid) cache.set(url, grid);
  return grid;
}

/** Cancel a frame's source fetches that have not started (it is hidden or dropped). */
export function cancelFrame(time: string): number {
  return (
    queues.gibs.abortWhere((tag, started) => tag === time && !started) +
    queues.eumetsat.abortWhere((tag, started) => tag === time && !started)
  );
}
