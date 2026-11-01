// Whole OpenFreeMap vector tiles (OpenMapTiles schema, OSM data) for the boundary, place
// name and road overlays. Every overlay, and every overzoomed child of a tile, draws from
// the same decoded tile, so tiles are fetched once through a bounded queue and kept decoded
// in memory only (a small LRU) — never written to any storage.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { cachedLoad, LruCache } from '../../core/net/LruCache';
import { RequestQueue } from '../../core/net/RequestQueue';
import { ProviderError } from '../base/types';
import { resolveTileTemplate } from './openfreemapBuildings';

/** Deepest zoom OpenFreeMap serves (TileJSON maxzoom, checked 2026-11-01). */
export const OPENFREEMAP_MAX_ZOOM = 14;

const queue = new RequestQueue('openfreemap', 6);
const cache = new LruCache<VectorTile | null>(96);

/** The decoded tile, or null where the provider has none (open ocean beyond the buffer). */
export function fetchVectorTile(
  providerId: string,
  z: number,
  x: number,
  y: number,
): Promise<VectorTile | null> {
  const key = `${z}/${x}/${y}`;
  return cachedLoad(cache, queue, key, async (signal) => {
    const { template } = await resolveTileTemplate(signal);
    const url = template
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
    if (response.status === 404 || response.status === 204) return null;
    if (!response.ok)
      throw new ProviderError(providerId, `Vector tile ${key}: HTTP ${response.status}`);
    return new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
  });
}
