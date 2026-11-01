// Whole OpenFreeMap vector tiles (OpenMapTiles schema, OSM data) for the boundary and
// place-name overlays. Both overlays, and every overzoomed child of a tile, draw from the
// same decoded tile, so tiles are fetched once through a bounded queue and kept decoded in
// memory only (a small LRU) — never written to any storage.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { RequestQueue } from '../../core/net/RequestQueue';
import { ProviderError } from '../base/types';
import { resolveTileTemplate } from './openfreemapBuildings';

/** Deepest zoom OpenFreeMap serves (TileJSON maxzoom, checked 2026-11-01). */
export const OPENFREEMAP_MAX_ZOOM = 14;

const CACHE_SIZE = 96;
const queue = new RequestQueue('openfreemap', 6);
const cache = new Map<string, VectorTile | null>();

function remember(key: string, tile: VectorTile | null): void {
  cache.delete(key);
  cache.set(key, tile);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** The decoded tile, or null where the provider has none (open ocean beyond the buffer). */
export async function fetchVectorTile(
  providerId: string,
  z: number,
  x: number,
  y: number,
): Promise<VectorTile | null> {
  const key = `${z}/${x}/${y}`;
  if (cache.has(key)) {
    const tile = cache.get(key)!;
    remember(key, tile);
    return tile;
  }
  return queue.enqueue(key, async (signal) => {
    const { template } = await resolveTileTemplate(signal);
    const url = template
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
    if (response.status === 404 || response.status === 204) {
      remember(key, null);
      return null;
    }
    if (!response.ok)
      throw new ProviderError(providerId, `Vector tile ${key}: HTTP ${response.status}`);
    const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
    remember(key, tile);
    return tile;
  });
}
