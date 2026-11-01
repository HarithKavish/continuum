// Building footprints from OpenFreeMap vector tiles (OpenMapTiles schema, OSM data).
//
// The TileJSON is fetched once per session to discover the current planet build's tile
// URL; tiles are then requested only for the few zoom-14 tiles around the camera when it
// is close to the ground.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { z } from 'zod';
import { appConfig } from '../../config/application';
import { fetchJson } from '../base/http';
import { ProviderError } from '../base/types';

export const PROVIDER_ID = 'openfreemap-buildings';

export interface BuildingFootprint {
  /** OSM-derived feature id when the tile carries one. */
  sourceRecordId: string;
  /** Outer ring, [lon, lat] pairs. */
  ring: [number, number][];
  /** Height of the top above ground, metres (OpenMapTiles render_height). */
  height: number;
  /** Height of the base above ground, metres (render_min_height). */
  minHeight: number;
  centroid: [number, number];
}

const tileJsonSchema = z.object({
  tiles: z.array(z.string()).min(1),
  maxzoom: z.number().optional(),
  attribution: z.string().optional(),
});

let tileTemplate: Promise<{ template: string; build: string }> | undefined;

export function resolveTileTemplate(
  signal?: AbortSignal,
): Promise<{ template: string; build: string }> {
  tileTemplate ??= fetchJson(
    PROVIDER_ID,
    appConfig.buildings.tileJsonUrl,
    tileJsonSchema,
    signal ? { signal } : {},
  )
    .then((tj) => {
      const template = tj.tiles[0]!;
      const build = /planet\/([^/]+)\//.exec(template)?.[1] ?? 'unknown';
      return { template, build };
    })
    .catch((error: unknown) => {
      tileTemplate = undefined;
      throw error;
    });
  return tileTemplate;
}

export async function fetchBuildingTile(
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<BuildingFootprint[]> {
  const { template } = await resolveTileTemplate(signal);
  const url = template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (response.status === 404 || response.status === 204) return [];
  if (!response.ok)
    throw new ProviderError(PROVIDER_ID, `Vector tile ${z}/${x}/${y}: HTTP ${response.status}`);
  const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
  const layer = tile.layers.building;
  if (!layer) return [];
  const out: BuildingFootprint[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 3) continue; // polygons only
    const props = feature.properties;
    if (props.hide_3d === true) continue;
    const geojson = feature.toGeoJSON(x, y, z);
    const polygons: GeoJSON.Position[][][] =
      geojson.geometry.type === 'Polygon'
        ? [geojson.geometry.coordinates]
        : geojson.geometry.type === 'MultiPolygon'
          ? geojson.geometry.coordinates
          : [];
    for (const polygon of polygons) {
      const outer = polygon[0];
      if (!outer || outer.length < 4) continue;
      const ring = outer.map((p) => [p[0]!, p[1]!] as [number, number]);
      const centroid = ring.reduce<[number, number]>(
        (acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length],
        [0, 0],
      );
      out.push({
        sourceRecordId: feature.id !== undefined ? String(feature.id) : `${z}/${x}/${y}#${i}`,
        ring,
        height: Number(props.render_height ?? 0),
        minHeight: Number(props.render_min_height ?? 0),
        centroid,
      });
    }
  }
  return out;
}
