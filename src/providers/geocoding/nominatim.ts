// Place search through the OpenStreetMap Foundation's Nominatim service.
//
// Usage policy (https://operations.osmfoundation.org/policies/nominatim/): at most one
// request per second, no autocomplete, identify the application (the browser's Referer
// does this), display attribution, and be able to switch the service off without a code
// change. Searches here run only on explicit submit, through a 1 s gate, and are cached in
// memory for the session.

import { z } from 'zod';
import { appConfig } from '../../config/application';
import { createRateGate, fetchJson } from '../base/http';
import { type GeocodeResult, ProviderError } from '../base/types';

export const PROVIDER_ID = 'osm-nominatim';

const gate = createRateGate(1100);
const cache = new Map<string, GeocodeResult[]>();

const schema = z.array(
  z.object({
    place_id: z.number(),
    osm_type: z.string().optional(),
    osm_id: z.number().optional(),
    lat: z.string(),
    lon: z.string(),
    display_name: z.string(),
    name: z.string().optional(),
    category: z.string().optional(),
    type: z.string().optional(),
    boundingbox: z.array(z.string()).length(4).optional(),
  }),
);

export async function searchPlaces(query: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  if (!appConfig.geocoding.enabled)
    throw new ProviderError(PROVIDER_ID, 'Place search is switched off.');
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  await gate(signal);
  const params = new URLSearchParams({
    q: query.trim(),
    format: 'jsonv2',
    limit: '8',
    'accept-language': navigator.language || 'en',
  });
  const body = await fetchJson(PROVIDER_ID, `${appConfig.geocoding.endpoint}?${params}`, schema, {
    signal,
  });
  const results: GeocodeResult[] = body.map((r) => {
    const bb = r.boundingbox?.map(Number) as [number, number, number, number] | undefined;
    return {
      providerId: PROVIDER_ID,
      sourceRecordId:
        r.osm_type && r.osm_id !== undefined ? `${r.osm_type}/${r.osm_id}` : String(r.place_id),
      name: r.name || r.display_name.split(',')[0]!,
      detail: r.display_name,
      lat: Number(r.lat),
      lon: Number(r.lon),
      bbox: bb && bb.every(Number.isFinite) ? bb : null,
      kind: [r.category, r.type].filter(Boolean).join(' · '),
    };
  });
  cache.set(key, results);
  return results;
}
