import { describe, expect, it } from 'vitest';
import {
  cloudTopHeightKm,
  MAX_SHADOW_OFFSET,
  MIN_SUN_ELEVATION,
  shadowOffset,
  subsolarPoint,
  sunAt,
} from '../../src/spatial/imagery/cloudShadow';

const DEG = Math.PI / 180;

describe('cloud shadows', () => {
  it('reads cloud-top height from temperature with the standard atmosphere', () => {
    // Opacity 0 is 0 °C: (15 − 0) / 6.5 = 2.3 km. Opacity 1 is −40 °C or colder: ≥ 8.5 km.
    expect(cloudTopHeightKm(0)).toBeCloseTo(15 / 6.5, 3);
    expect(cloudTopHeightKm(1)).toBeCloseTo(55 / 6.5, 3);
    expect(cloudTopHeightKm(0.5)).toBeCloseTo(35 / 6.5, 3);
    expect(cloudTopHeightKm(2)).toBeCloseTo(55 / 6.5, 3); // clamped
  });

  it('puts the Sun overhead on the Tropic of Cancer at the June solstice, near Greenwich at noon', () => {
    const sub = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    expect(sub.lat).toBeCloseTo(23.44, 1);
    expect(Math.abs(sub.lon)).toBeLessThan(1); // the equation of time is ~2 minutes then
    const equinox = subsolarPoint(new Date('2026-03-20T12:00:00Z'));
    expect(Math.abs(equinox.lat)).toBeLessThan(0.5);
  });

  it('gives the Sun’s elevation and direction from any point', () => {
    const sub = { lat: 10, lon: 40 };
    expect(sunAt(10, 40, sub).elevation / DEG).toBeCloseTo(90, 4);
    // 30° north of the subsolar point: the Sun is 60° up, due south.
    const north = sunAt(40, 40, sub);
    expect(north.elevation / DEG).toBeCloseTo(60, 6);
    expect(Math.abs(north.azimuth / DEG)).toBeCloseTo(180, 6);
    // On the equator 30° west of it, the Sun stands to the east.
    const west = sunAt(0, 10, { lat: 0, lon: 40 });
    expect(west.azimuth / DEG).toBeCloseTo(90, 6);
    // On the far side of the Earth it is below the horizon.
    expect(sunAt(-10, -140, sub).elevation).toBeLessThan(0);
  });

  it('casts longer shadows from lower Sun and higher cloud, and none without sun', () => {
    expect(shadowOffset(8, 45 * DEG)).toBeCloseTo(8000, 3);
    expect(shadowOffset(8, 30 * DEG)!).toBeGreaterThan(shadowOffset(8, 60 * DEG)!);
    expect(shadowOffset(2, 30 * DEG)!).toBeLessThan(shadowOffset(8, 30 * DEG)!);
    expect(shadowOffset(8, MIN_SUN_ELEVATION / 2)).toBeNull();
    expect(shadowOffset(8, -10 * DEG)).toBeNull();
    // The coldest tops (8.5 km) with the Sun just above 3°: 160 km, capped.
    expect(shadowOffset(cloudTopHeightKm(1), 3.05 * DEG)).toBe(MAX_SHADOW_OFFSET);
  });
});
