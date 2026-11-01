// Current modelled weather at a point, from the Open-Meteo forecast API.

import { z } from 'zod';
import { fetchJson } from '../base/http';
import type { WeatherSample } from '../base/types';

export const PROVIDER_ID = 'open-meteo-weather';

const VARIABLES = [
  ['temperature_2m', 'Air temperature (2 m)'],
  ['relative_humidity_2m', 'Relative humidity'],
  ['precipitation', 'Precipitation'],
  ['cloud_cover', 'Cloud cover'],
  ['pressure_msl', 'Pressure (sea level)'],
  ['wind_speed_10m', 'Wind speed (10 m)'],
  ['wind_direction_10m', 'Wind direction'],
] as const;

const schema = z.object({
  elevation: z.number().nullable().optional(),
  current: z.record(z.string(), z.union([z.number(), z.string()]).nullable()),
  current_units: z.record(z.string(), z.string()),
});

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<WeatherSample> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: VARIABLES.map(([v]) => v).join(','),
    timezone: 'GMT',
    wind_speed_unit: 'ms',
  });
  const body = await fetchJson(
    PROVIDER_ID,
    `https://api.open-meteo.com/v1/forecast?${params}`,
    schema,
    { signal },
  );
  const values = VARIABLES.flatMap(([key, label]) => {
    const value = body.current[key];
    return typeof value === 'number' ? [{ label, value, unit: body.current_units[key] ?? '' }] : [];
  });
  const time =
    typeof body.current.time === 'string' ? `${body.current.time}:00Z` : new Date().toISOString();
  return {
    providerId: PROVIDER_ID,
    time: new Date(time).toISOString(),
    values,
    model: 'Open-Meteo best-match blend of national weather models',
    retrievedAt: new Date().toISOString(),
    gridElevation: body.elevation ?? null,
  };
}
