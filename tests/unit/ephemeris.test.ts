import { describe, expect, it } from 'vitest';
import {
  AU,
  eccentricAnomaly,
  heliocentric,
  orbitalPeriodDays,
  tableFor,
  type PlanetId,
  type Vec3,
} from '../../src/spatial/space/ephemeris';
import {
  apply,
  icrfToBodyFixed,
  multiply,
  transpose,
  type RotatingId,
} from '../../src/spatial/space/orientation';
import { HORIZONS_POSITIONS, HORIZONS_SUB_EARTH } from './horizonsReference';

/**
 * JPL's nominal errors (approx_pos.html): heliocentric longitude and latitude (″) and
 * distance (1000 km), for Table 1 (1800–2050) and Table 2a (3000 BC – AD 3000). The tests
 * allow twice the nominal error.
 */
const NOMINAL: Record<'1' | '2a', Record<PlanetId, [number, number, number]>> = {
  '1': {
    mercury: [15, 1, 1],
    venus: [20, 1, 4],
    emb: [20, 8, 6],
    mars: [40, 2, 25],
    jupiter: [400, 10, 600],
    saturn: [600, 25, 1500],
    uranus: [50, 2, 1000],
    neptune: [10, 1, 200],
  },
  '2a': {
    mercury: [20, 15, 1],
    venus: [40, 30, 8],
    emb: [40, 15, 15],
    mars: [100, 40, 30],
    jupiter: [600, 100, 1000],
    saturn: [1000, 100, 4000],
    uranus: [2000, 30, 8000],
    neptune: [400, 15, 4000],
  },
};
const PLANETS = Object.keys(NOMINAL['1']) as PlanetId[];

const norm = (v: Vec3) => Math.hypot(...v);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Angle between two directions, arcseconds. */
function arcsec(a: Vec3, b: Vec3): number {
  const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (norm(a) * norm(b));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180 * 3600) / Math.PI;
}

/**
 * Neptune's elements follow its position about the solar-system barycentre: measured 1–6″
 * from that and 1–45″ (up to 0.9 million km in distance) from the heliocentric position the
 * app needs. The difference is the Sun's own offset from the barycentre (up to about two
 * solar radii, 1.5 million km), seen from 30 au. So Neptune's bounds are 60″ and 1.5
 * million km: 0.017° and 0.01 au.
 */
const NEPTUNE_HELIOCENTRIC = { arcsec: 60, thousandKm: 1500 };

function within(table: '1' | '2a', id: PlanetId, ours: Vec3, theirs: Vec3): void {
  const [lon, lat, rho] = NOMINAL[table][id];
  const neptune = table === '1' && id === 'neptune';
  const angleBound = neptune ? NEPTUNE_HELIOCENTRIC.arcsec : 2 * Math.hypot(lon, lat);
  const distanceBound = neptune ? NEPTUNE_HELIOCENTRIC.thousandKm : 2 * rho;
  expect(arcsec(ours, theirs), `${id} direction (table ${table})`).toBeLessThan(angleBound);
  expect(Math.abs(norm(ours) - norm(theirs)) * (AU / 1e6), `${id} distance`).toBeLessThan(
    distanceBound,
  );
}

describe('planet positions (JPL approximate elements)', () => {
  for (const [date, ref] of Object.entries(HORIZONS_POSITIONS)) {
    it(`agree with JPL Horizons within JPL's stated errors, ${date}`, () => {
      expect(tableFor(ref.jdTdb)).toBe('1');
      for (const id of PLANETS) within('1', id, heliocentric(id, ref.jdTdb), ref.au[id]!);
    });

    it(`agree with Horizons using the 3000 BC – AD 3000 table too, ${date}`, () => {
      for (const id of PLANETS) within('2a', id, heliocentric(id, ref.jdTdb, '2a'), ref.au[id]!);
    });
  }

  it('picks Table 1 for 1800–2050 and Table 2a outside it', () => {
    expect(tableFor(2_451_545)).toBe('1');
    expect(tableFor(2_378_497)).toBe('1'); // 1800-01-01
    expect(tableFor(2_469_808 + 366)).toBe('2a'); // 2051
    expect(tableFor(2_305_448)).toBe('2a'); // 1600
  });

  it('places Pluto exactly at its element epoch, within 0.2° from 2000 to 2040', () => {
    const near = HORIZONS_POSITIONS['2026-11-01 00:00 TDB']!;
    expect(arcsec(heliocentric('pluto', near.jdTdb), near.au['pluto']!)).toBeLessThan(1);
    for (const date of ['2000-01-01 12:00 TDB', '2040-06-15 00:00 TDB']) {
      const ref = HORIZONS_POSITIONS[date]!;
      expect(arcsec(heliocentric('pluto', ref.jdTdb), ref.au['pluto']!) / 3600).toBeLessThan(0.2);
    }
  });

  it('solves Kepler’s equation to the JPL tolerance', () => {
    for (const e of [0.0068, 0.0934, 0.2056, 0.2463])
      for (const M of [-179, -90, -1, 0, 1, 45, 90, 179]) {
        const E = eccentricAnomaly(M, e);
        const back = E - (e * 180 * Math.sin((E * Math.PI) / 180)) / Math.PI;
        expect(Math.abs(back - M)).toBeLessThan(1e-6);
      }
  });

  it('gives orbital periods from the mean motion', () => {
    expect(orbitalPeriodDays('emb')).toBeCloseTo(365.256, 2);
    expect(orbitalPeriodDays('mars')).toBeCloseTo(686.98, 1);
    expect(orbitalPeriodDays('neptune') / 365.25).toBeCloseTo(167, -1);
    expect(orbitalPeriodDays('pluto') / 365.25).toBeGreaterThan(240);
  });
});

/** Planetodetic latitude from planetocentric, for a spheroid with polar/equatorial ratio q. */
const detic = (centricDeg: number, q: number) =>
  (Math.atan(Math.tan((centricDeg * Math.PI) / 180) / (q * q)) * 180) / Math.PI;
const POLAR_RATIO: Partial<Record<RotatingId, number>> = {
  mars: 3376.2 / 3396.19,
  jupiter: 66854 / 71492,
  saturn: 54364 / 60268,
  uranus: 24973 / 25559,
  neptune: 24341 / 24764,
};
/** TT − UTC at 2026-11-01 (32.184 s + 37 leap seconds); TDB − TT is under 2 ms. */
const TT_MINUS_UTC_DAYS = 69.184 / 86_400;

describe('body orientation (IAU 2015)', () => {
  const ref = HORIZONS_POSITIONS['2026-11-01 00:00 TDB']!;
  const bodies: RotatingId[] = [
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
    'pluto',
  ];
  for (const id of bodies) {
    it(`puts the sub-Earth point where Horizons does: ${id}`, () => {
      const sub_ = HORIZONS_SUB_EARTH[id]!;
      // Horizons gives the point for 00:00 UT, seen with light time: the body as it was
      // when the light left it. Positions move little in that time; rotation does not.
      const jdUt = 2_461_345.5;
      const jdTdb = jdUt + TT_MINUS_UTC_DAYS - sub_.lightTimeMin / 1440;
      const toEarth = sub(ref.au['earth']!, ref.au[id]!);
      const v = apply(icrfToBodyFixed(id, jdTdb), toEarth);
      const lonEast = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
      const latCentric = (Math.asin(v[2] / norm(v)) * 180) / Math.PI;
      const expectedEast = sub_.sign === 'E' ? sub_.lon : (360 - sub_.lon) % 360;
      const dLon = ((lonEast - expectedEast + 540) % 360) - 180;
      expect(Math.abs(dLon), `longitude ${lonEast} vs ${expectedEast}`).toBeLessThan(0.2);
      const lat = detic(latCentric, POLAR_RATIO[id] ?? 1);
      expect(Math.abs(lat - sub_.lat), `latitude ${lat} vs ${sub_.lat}`).toBeLessThan(0.2);
    });
  }

  it('returns proper rotations', () => {
    for (const id of bodies) {
      const m = icrfToBodyFixed(id, 2_461_345.5);
      const identity = multiply(m, transpose(m));
      identity.forEach((v, k) => expect(v).toBeCloseTo(k % 4 === 0 ? 1 : 0, 12));
      // Determinant +1: a rotation, not a reflection.
      const det =
        m[0] * (m[4] * m[8] - m[5] * m[7]) -
        m[1] * (m[3] * m[8] - m[5] * m[6]) +
        m[2] * (m[3] * m[7] - m[4] * m[6]);
      expect(det).toBeCloseTo(1, 12);
    }
  });
});
