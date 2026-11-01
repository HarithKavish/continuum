// Building footprints from Overture Maps (OpenStreetMap, Google Open Buildings, Microsoft
// and other sources, conflated), read straight from Overture's public PMTiles archive with
// HTTP range requests. The current release is looked up in Overture's STAC catalogue once
// per session, since older releases are removed. Tiles are kept decoded in memory only.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { PMTiles } from 'pmtiles';
import { z } from 'zod';
import { RequestQueue } from '../../core/net/RequestQueue';
import { fetchJson } from '../base/http';

export const PROVIDER_ID = 'overture-buildings';
const CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';
const archiveUrl = (release: string) =>
  `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/buildings.pmtiles`;

/** Deepest zoom in the archive (header maxZoom, checked 2026-11-01). */
export const OVERTURE_MAX_ZOOM = 14;

const catalogSchema = z.object({ latest: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/) });

let archive: Promise<{ pmtiles: PMTiles; release: string }> | undefined;
function openArchive(): Promise<{ pmtiles: PMTiles; release: string }> {
  archive ??= fetchJson(PROVIDER_ID, CATALOG_URL, catalogSchema)
    .then(({ latest }) => ({ pmtiles: new PMTiles(archiveUrl(latest)), release: latest }))
    .catch((error: unknown) => {
      archive = undefined;
      throw error;
    });
  return archive;
}

/** The Overture release in use, once known. */
export async function overtureRelease(): Promise<string> {
  return (await openArchive()).release;
}

// Zoom-14 tiles run to ~2 MB in dense places, so only a few are kept.
const CACHE_SIZE = 12;
const queue = new RequestQueue('overture', 4);
const cache = new Map<string, VectorTile | null>();

function remember(key: string, tile: VectorTile | null): void {
  cache.delete(key);
  cache.set(key, tile);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

/** The decoded tile, or null where the archive has none. */
export async function fetchBuildingFootprints(
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
    const { pmtiles } = await openArchive();
    const response = await pmtiles.getZxy(z, x, y, signal);
    const tile = response ? new VectorTile(new PbfReader(new Uint8Array(response.data))) : null;
    remember(key, tile);
    return tile;
  });
}
