// Where a cloud's shadow falls. The satellites measure cloud-top temperature, not height;
// the International Standard Atmosphere (15 °C at sea level, cooling 6.5 K per km) turns
// that temperature into a height, and the Sun's elevation and azimuth at the frame's time
// turn the height into an offset along the ground. Pure functions.

import { CLEAR_SKY_C, OPAQUE_CLOUD_C } from './cloudImagery';

/** ISA sea-level temperature (°C) and tropospheric lapse rate (K per km). */
const ISA_SEA_LEVEL_C = 15;
const LAPSE_RATE = 6.5;
/** No shadows below this Sun elevation: they would stretch to hundreds of kilometres. */
export const MIN_SUN_ELEVATION = (3 * Math.PI) / 180;
/** Longest shadow offset drawn, metres. */
export const MAX_SHADOW_OFFSET = 150_000;
/** How dark a full shadow is: a display choice (the cloudless imagery has no shadows). */
export const SHADOW_STRENGTH = 0.55;

const RAD = Math.PI / 180;

/**
 * Cloud-top height (km) for a drawn opacity (0–1). Opacity is a linear ramp of brightness
 * temperature from CLEAR_SKY_C to OPAQUE_CLOUD_C, so it inverts to a temperature; fully
 * opaque cloud is at least as cold as OPAQUE_CLOUD_C, so its height is a lower bound.
 */
export function cloudTopHeightKm(opacity: number): number {
  const o = Math.min(1, Math.max(0, opacity));
  const celsius = CLEAR_SKY_C + o * (OPAQUE_CLOUD_C - CLEAR_SKY_C);
  return Math.max(0, (ISA_SEA_LEVEL_C - celsius) / LAPSE_RATE);
}

/**
 * Where the Sun is overhead at `date`, from the Astronomical Almanac's low-precision solar
 * coordinates (about 0.01°) and Greenwich mean sidereal time. Degrees.
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const n = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const anomaly = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(lambda), Math.cos(lambda));
  const gmst = 280.46061837 + 360.98564736629 * n;
  const lon = ((((rightAscension / RAD - gmst) % 360) + 540) % 360) - 180;
  return { lat: declination / RAD, lon };
}

/** The Sun's elevation and azimuth (clockwise from north), radians, seen from a point. */
export function sunAt(
  latDeg: number,
  lonDeg: number,
  sub: { lat: number; lon: number },
): { elevation: number; azimuth: number } {
  const phi = latDeg * RAD;
  const delta = sub.lat * RAD;
  const h = (sub.lon - lonDeg) * RAD;
  const elevation = Math.asin(
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h),
  );
  const azimuth = Math.atan2(
    Math.cos(delta) * Math.sin(h),
    Math.cos(phi) * Math.sin(delta) - Math.sin(phi) * Math.cos(delta) * Math.cos(h),
  );
  return { elevation, azimuth };
}

/** How far along the ground a cloud top `heightKm` up casts its shadow, metres; null without sun. */
export function shadowOffset(heightKm: number, elevation: number): number | null {
  if (elevation < MIN_SUN_ELEVATION) return null;
  return Math.min(MAX_SHADOW_OFFSET, (heightKm * 1000) / Math.tan(elevation));
}
