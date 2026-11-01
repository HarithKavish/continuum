import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { meanSeaLevel } from 'egm96-universal';
import { describe, expect, it } from 'vitest';
import { geoidFromDeltaGrid } from '../../src/spatial/geoid/egm96';

const bytes = gunzipSync(readFileSync('public/data/egm96-15min.bin.gz'));
const geoid = geoidFromDeltaGrid(
  new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2),
);

describe('EGM96 geoid grid', () => {
  it('agrees with egm96-universal (tested against NGA) to the centimetre everywhere', () => {
    let worst = 0;
    // Deterministic pseudo-random sample, plus the poles and the antimeridian.
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const points: [number, number][] = [
      [90, 0],
      [-90, 0],
      [0, 180],
      [0, -180],
      [12.34, 179.99],
    ];
    for (let i = 0; i < 5000; i++) points.push([rand() * 180 - 90, rand() * 360 - 180]);
    for (const [lat, lon] of points)
      worst = Math.max(worst, Math.abs(geoid(lat, lon) - meanSeaLevel(lat, lon)));
    expect(worst).toBeLessThan(0.006);
  });

  it('reproduces well-known undulations', () => {
    // Indian Ocean geoid low (~ -106 m) and New Guinea high (~ +79 m).
    expect(geoid(4.75, 78.75)).toBeLessThan(-100);
    expect(geoid(-4.5, 143.5)).toBeGreaterThan(70);
    // Greenland Summit, used to verify the ArcticDEM datum (docs/RESEARCH.md).
    expect(geoid(72.5796, -38.4592)).toBeCloseTo(43.9, 0);
  });
});
