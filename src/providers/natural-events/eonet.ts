// NASA EONET v3 natural events. https://eonet.gsfc.nasa.gov/docs/v3

import { z } from 'zod';
import { fetchJson } from '../base/http';
import type { ObservationRecord } from '../base/types';

export const PROVIDER_ID = 'nasa-eonet';

export const EONET_CATEGORIES = {
  wildfires: 'Wildfires',
  severeStorms: 'Severe storms',
  volcanoes: 'Volcanoes',
  seaLakeIce: 'Sea and lake ice',
  floods: 'Floods',
  earthquakes: 'Earthquakes',
  landslides: 'Landslides',
  drought: 'Drought',
  dustHaze: 'Dust and haze',
  snow: 'Snow',
  tempExtremes: 'Temperature extremes',
  waterColor: 'Water colour',
  manmade: 'Manmade',
} as const;

const geometry = z.object({
  magnitudeValue: z.number().nullable().optional(),
  magnitudeUnit: z.string().nullable().optional(),
  date: z.string(),
  type: z.enum(['Point', 'Polygon', 'LineString']),
  coordinates: z.array(z.unknown()),
});

const event = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  link: z.string(),
  closed: z.string().nullable(),
  categories: z.array(z.object({ id: z.string(), title: z.string() })),
  sources: z.array(z.object({ id: z.string(), url: z.string() })),
  geometry: z.array(geometry),
});

const response = z.object({ events: z.array(z.unknown()) });

/** Representative point for a geometry: the point itself, or the vertex centroid. */
function representativePoint(g: z.infer<typeof geometry>): [number, number] | null {
  if (g.type === 'Point') {
    const [lon, lat] = g.coordinates as [number, number];
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }
  const ring =
    (g.type === 'Polygon' ? (g.coordinates[0] as number[][]) : (g.coordinates as number[][])) ?? [];
  if (!ring.length) return null;
  const sum = ring.reduce((acc, [lon, lat]) => [acc[0]! + lon!, acc[1]! + lat!], [0, 0]);
  return [sum[0]! / ring.length, sum[1]! / ring.length];
}

export function normaliseEvent(raw: z.infer<typeof event>): ObservationRecord | null {
  // EONET orders geometries chronologically; the latest is the event's current position.
  const latest = raw.geometry[raw.geometry.length - 1];
  if (!latest) return null;
  const point = representativePoint(latest);
  if (!point) return null;
  const category = raw.categories[0];
  const track =
    raw.geometry.length > 1 && raw.geometry.every((g) => g.type === 'Point')
      ? ({
          type: 'LineString',
          coordinates: raw.geometry.map((g) => g.coordinates as number[]),
        } as GeoJSON.LineString)
      : latest.type === 'Polygon'
        ? ({ type: 'Polygon', coordinates: latest.coordinates as number[][][] } as GeoJSON.Polygon)
        : null;
  return {
    id: `${PROVIDER_ID}:${raw.id}`,
    providerId: PROVIDER_ID,
    sourceRecordId: raw.id,
    kind: 'natural-event',
    category: category?.id ?? 'unknown',
    title: raw.title,
    time: new Date(latest.date).toISOString(),
    updated: null,
    lat: point[1],
    lon: point[0],
    elevationMeters: null,
    magnitude:
      latest.magnitudeValue !== null && latest.magnitudeValue !== undefined
        ? { value: latest.magnitudeValue, unit: latest.magnitudeUnit ?? '' }
        : null,
    geometry: track,
    properties: {
      category: category?.title ?? null,
      firstObserved: raw.geometry[0] ? new Date(raw.geometry[0].date).toISOString() : null,
      observations: raw.geometry.length,
      closed: raw.closed,
      sources: raw.sources.map((s) => s.id).join(', '),
      description: raw.description ?? null,
    },
    links: [
      { label: 'EONET record', url: raw.link },
      ...raw.sources.map((s) => ({ label: `Source: ${s.id}`, url: s.url })),
    ],
    attribution: 'NASA EONET',
  };
}

export interface EonetResult {
  records: ObservationRecord[];
  skipped: number;
  retrievedAt: string;
}

export async function fetchOpenEvents(
  categories: string[],
  days: number,
  signal?: AbortSignal,
): Promise<EonetResult> {
  const params = new URLSearchParams({ status: 'open', days: String(days) });
  if (categories.length) params.set('category', categories.join(','));
  const body = await fetchJson(
    PROVIDER_ID,
    `https://eonet.gsfc.nasa.gov/api/v3/events?${params}`,
    response,
    {
      timeoutMs: 30_000,
      ...(signal ? { signal } : {}),
    },
  );
  const records: ObservationRecord[] = [];
  let skipped = 0;
  for (const raw of body.events) {
    const parsed = event.safeParse(raw);
    const record = parsed.success ? normaliseEvent(parsed.data) : null;
    if (record) records.push(record);
    else skipped++;
  }
  return { records, skipped, retrievedAt: new Date().toISOString() };
}
