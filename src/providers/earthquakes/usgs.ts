// USGS real-time earthquake GeoJSON summary feeds.
// https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php

import { z } from 'zod';
import { fetchJson } from '../base/http';
import type { ObservationRecord } from '../base/types';

export const PROVIDER_ID = 'usgs-earthquakes';

export const EARTHQUAKE_FEEDS = {
  all_day: 'All, past day',
  '2.5_day': 'M2.5+, past day',
  '2.5_week': 'M2.5+, past 7 days',
  '4.5_week': 'M4.5+, past 7 days',
  '4.5_month': 'M4.5+, past 30 days',
  significant_month: 'Significant, past 30 days',
} as const;

export type EarthquakeFeed = keyof typeof EARTHQUAKE_FEEDS;

const feature = z.object({
  id: z.string(),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z
      .tuple([z.number(), z.number(), z.number().nullable()])
      .or(z.array(z.number().nullable()).min(2)),
  }),
  properties: z.object({
    mag: z.number().nullable(),
    magType: z.string().nullable(),
    place: z.string().nullable(),
    time: z.number(),
    updated: z.number().nullable(),
    url: z.string().nullable(),
    detail: z.string().nullable().optional(),
    status: z.string().nullable(),
    tsunami: z.number().nullable(),
    sig: z.number().nullable(),
    alert: z.string().nullable(),
    net: z.string().nullable(),
    type: z.string().nullable(),
    title: z.string().nullable(),
    felt: z.number().nullable().optional(),
    nst: z.number().nullable().optional(),
    gap: z.number().nullable().optional(),
    dmin: z.number().nullable().optional(),
    rms: z.number().nullable().optional(),
  }),
});

const collection = z.object({
  type: z.literal('FeatureCollection'),
  metadata: z.object({
    generated: z.number(),
    title: z.string(),
    count: z.number(),
    url: z.string(),
  }),
  features: z.array(z.unknown()),
});

export interface EarthquakeFeedResult {
  records: ObservationRecord[];
  generated: string;
  title: string;
  skipped: number;
}

export function normaliseEarthquake(raw: z.infer<typeof feature>): ObservationRecord {
  const [lon, lat, depthKm] = raw.geometry.coordinates as [number, number, number | null];
  const p = raw.properties;
  return {
    id: `${PROVIDER_ID}:${raw.id}`,
    providerId: PROVIDER_ID,
    sourceRecordId: raw.id,
    kind: 'earthquake',
    category: p.type ?? 'earthquake',
    title: p.title ?? p.place ?? raw.id,
    time: new Date(p.time).toISOString(),
    updated: p.updated ? new Date(p.updated).toISOString() : null,
    lat,
    lon,
    // USGS reports depth in km (positive down); the record stores metres, negative below.
    elevationMeters: depthKm === null || depthKm === undefined ? null : -depthKm * 1000,
    magnitude: p.mag === null ? null : { value: p.mag, unit: p.magType ?? 'unspecified' },
    geometry: null,
    properties: {
      place: p.place,
      status: p.status,
      network: p.net,
      tsunamiFlag: p.tsunami,
      significance: p.sig,
      pagerAlert: p.alert,
      feltReports: p.felt ?? null,
      stations: p.nst ?? null,
      azimuthalGapDeg: p.gap ?? null,
      nearestStationDeg: p.dmin ?? null,
      rmsTravelTimeResidualS: p.rms ?? null,
      depthKm: depthKm ?? null,
    },
    links: p.url ? [{ label: 'USGS event page', url: p.url }] : [],
    attribution: 'U.S. Geological Survey',
  };
}

export async function fetchEarthquakes(
  feed: EarthquakeFeed,
  signal?: AbortSignal,
): Promise<EarthquakeFeedResult> {
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`;
  const body = await fetchJson(PROVIDER_ID, url, collection, signal ? { signal } : {});
  const records: ObservationRecord[] = [];
  let skipped = 0;
  for (const f of body.features) {
    const parsed = feature.safeParse(f);
    if (parsed.success) records.push(normaliseEarthquake(parsed.data));
    else skipped++;
  }
  return {
    records,
    generated: new Date(body.metadata.generated).toISOString(),
    title: body.metadata.title,
    skipped,
  };
}
