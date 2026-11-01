// Heliocentric positions of the planets from JPL's "Approximate Positions of the Planets"
// (E. M. Standish and J. G. Williams, https://ssd.jpl.nasa.gov/planets/approx_pos.html):
// Keplerian elements and their rates relative to the mean ecliptic and equinox of J2000,
// solved and rotated exactly as that page describes. Table 1 is used for 1800–2050 and
// Table 2a, with the Table 2b terms, from 3000 BC to AD 3000. Pluto, which JPL removed from
// those tables, comes from osculating elements at one epoch (JPL Horizons) propagated as a
// two-body orbit. Pure functions: no rendering, so they can be checked against Horizons.

export type Vec3 = [number, number, number];
export type PlanetId =
  'mercury' | 'venus' | 'emb' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export type OrbitingId = PlanetId | 'pluto';

/** Astronomical unit, metres (IAU 2012 Resolution B2). */
export const AU = 149_597_870_700;
/** Julian date of J2000.0 (TDB). */
export const J2000 = 2_451_545.0;
const DEG = Math.PI / 180;
/** Obliquity of the ecliptic at J2000 used by the JPL page. */
const OBLIQUITY = 23.43928 * DEG;

/** a (au), e, I (°), L (°), longitude of perihelion ϖ (°), longitude of the node Ω (°). */
type Elements = [number, number, number, number, number, number];
/** Values at J2000, then rates per Julian century. */
type Table = Record<PlanetId, [Elements, Elements]>;

/** Table 1, valid 1800–2050. */
const TABLE_1: Table = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ],
  emb: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
};

/** Table 2a, valid 3000 BC – AD 3000. */
const TABLE_2A: Table = {
  mercury: [
    [0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
    [0.0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182],
  ],
  venus: [
    [0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496],
    [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174],
  ],
  emb: [
    [1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
    [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856],
  ],
  mars: [
    [1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
    [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431],
  ],
  jupiter: [
    [5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
    [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619],
  ],
  saturn: [
    [9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
    [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002],
  ],
  uranus: [
    [19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
    [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699],
  ],
  neptune: [
    [30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853],
    [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302],
  ],
};

/** Table 2b: b, c, s, f, added to M as bT² + c·cos(fT) + s·sin(fT) (degrees). */
const TABLE_2B: Partial<Record<PlanetId, [number, number, number, number]>> = {
  jupiter: [-0.00012452, 0.0606406, -0.35635438, 38.35125],
  saturn: [0.00025899, -0.13434469, 0.87320147, 38.35125],
  uranus: [0.00058331, -0.97731848, 0.17689245, 7.67025],
  neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025],
};

/**
 * Pluto's osculating heliocentric elements, ecliptic and equinox of J2000, from JPL
 * Horizons for 2026-11-01 00:00 TDB (JD 2461345.5). A two-body orbit drifts from the real
 * one away from that date (Neptune perturbs Pluto); see docs/ACCURACY.md.
 */
export const PLUTO_EPOCH = 2_461_345.5;
const PLUTO = {
  a: 38.937773733627,
  e: 0.2462732862753228,
  i: 17.19643179321815,
  node: 110.3543660091013,
  argPerihelion: 110.7975841514897,
  meanAnomaly: 56.58770082426752,
  /** Mean motion, degrees per day. */
  n: 0.004056461884945389,
};

/** The table whose validity covers a date; Table 1 where both do. */
export function tableFor(jdTdb: number): '1' | '2a' {
  const year = 2000 + (jdTdb - J2000) / 365.25;
  return year >= 1800 && year <= 2050 ? '1' : '2a';
}

/** Kepler's equation in degrees, as the JPL page solves it (tolerance 1e-6°). */
export function eccentricAnomaly(meanAnomalyDeg: number, e: number): number {
  const eStar = e / DEG;
  const M = meanAnomalyDeg;
  let E = M + eStar * Math.sin(M * DEG);
  for (let i = 0; i < 50; i++) {
    const dM = M - (E - eStar * Math.sin(E * DEG));
    const dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) <= 1e-6) break;
  }
  return E;
}

/** Wrap degrees to −180..180. */
function wrap180(deg: number): number {
  const d = (((deg + 180) % 360) + 360) % 360;
  return d - 180;
}

/** Position in the orbital plane rotated to the J2000 ecliptic, then to equatorial (ICRF) axes. */
function toEquatorial(
  a: number,
  e: number,
  eccentricDeg: number,
  iDeg: number,
  nodeDeg: number,
  argPeriDeg: number,
): Vec3 {
  const E = eccentricDeg * DEG;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = argPeriDeg * DEG;
  const O = nodeDeg * DEG;
  const I = iDeg * DEG;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;
  const ce = Math.cos(OBLIQUITY);
  const se = Math.sin(OBLIQUITY);
  return [x, ce * y - se * z, se * y + ce * z];
}

/**
 * Heliocentric position at a TDB Julian date, in astronomical units on ICRF (J2000
 * equatorial) axes. 'emb' is the Earth–Moon barycentre. `table` overrides the choice of
 * JPL table (for testing one against the other).
 */
export function heliocentric(
  id: OrbitingId,
  jdTdb: number,
  table: '1' | '2a' = tableFor(jdTdb),
): Vec3 {
  if (id === 'pluto') {
    const M = wrap180(PLUTO.meanAnomaly + PLUTO.n * (jdTdb - PLUTO_EPOCH));
    const E = eccentricAnomaly(M, PLUTO.e);
    return toEquatorial(PLUTO.a, PLUTO.e, E, PLUTO.i, PLUTO.node, PLUTO.argPerihelion);
  }
  const T = (jdTdb - J2000) / 36525;
  const which = table;
  const [base, rate] = (which === '1' ? TABLE_1 : TABLE_2A)[id];
  const [a, e, I, L, peri, node] = base.map((v, k) => v + rate[k]! * T) as Elements;
  let M = L - peri;
  const extra = which === '2a' ? TABLE_2B[id] : undefined;
  if (extra) {
    const [b, c, s, f] = extra;
    M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
  }
  const E = eccentricAnomaly(wrap180(M), e);
  return toEquatorial(a, e, E, I, node, peri - node);
}

/** Orbital period in days, from the rate of the mean longitude (or Pluto's mean motion). */
export function orbitalPeriodDays(id: OrbitingId): number {
  if (id === 'pluto') return 360 / PLUTO.n;
  return (360 * 36525) / TABLE_1[id][1][3];
}
