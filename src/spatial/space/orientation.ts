// Which way each body points: the IAU WGCCRE 2015 rotation models (Archinal et al. 2018),
// as published in NAIF's pck00011.tpc. Each gives the right ascension and declination of
// the north pole and the angle W of the prime meridian; the body-fixed frame has z along
// the pole and x through the prime meridian, so planetocentric longitudes are east-positive.
// Earth and the Moon are oriented by Cesium (IAU 2006 precession-nutation; the IAU Moon
// model). Pure functions, checked against JPL Horizons' sub-observer points.

import { J2000, type Vec3 } from './ephemeris';

export type RotatingId =
  'sun' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

/** Row-major 3×3 rotation. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

/** amplitude (°) · sin or cos (phase (°) + rate (°/century) · T). */
type Term = [amplitude: number, phase: number, rate: number];
const sum = (terms: Term[], T: number, f: (x: number) => number) =>
  terms.reduce((s, [amp, phase, rate]) => s + amp * f((phase + rate * T) * DEG), 0);

interface Model {
  /** Pole right ascension and declination: value at J2000 and rate per Julian century. */
  ra: [number, number];
  dec: [number, number];
  /** Prime meridian: value at J2000 and rate per day. */
  pm: [number, number];
  /** Periodic terms (pck00011 NUT_PREC): sine for RA and W, cosine for declination. */
  raTerms?: Term[];
  decTerms?: Term[];
  pmTerms?: Term[];
}

/**
 * pck00011 values. Left out, as below 0.011°: Jupiter's periodic pole terms (≤ 0.0022°) and
 * Mercury's libration in longitude (≤ 0.0107°).
 */
const MODELS: Record<RotatingId, Model> = {
  sun: { ra: [286.13, 0], dec: [63.87, 0], pm: [84.176, 14.1844] },
  mercury: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], pm: [329.5988, 6.1385108] },
  venus: { ra: [272.76, 0], dec: [67.16, 0], pm: [160.2, -1.4813688] },
  mars: {
    ra: [317.269202, -0.10927547],
    dec: [54.432516, -0.05827105],
    pm: [176.049863, 350.891982443297],
    raTerms: [
      [0.000068, 198.991226, 19139.4819985],
      [0.000238, 226.292679, 38280.8511281],
      [0.000052, 249.663391, 57420.7251593],
      [0.000009, 266.18351, 76560.636795],
      [0.419057, 79.398797, 0.5042615],
    ],
    decTerms: [
      [0.000051, 122.433576, 19139.9407476],
      [0.000141, 43.058401, 38280.8753272],
      [0.000031, 57.663379, 57420.7517205],
      [0.000005, 79.476401, 76560.6495004],
      [1.591274, 166.325722, 0.5042615],
    ],
    pmTerms: [
      [0.000145, 129.071773, 19140.0328244],
      [0.000157, 36.352167, 38281.0473591],
      [0.00004, 56.668646, 57420.929536],
      [0.000001, 67.364003, 76560.2552215],
      [0.000001, 104.79268, 95700.4387578],
      [0.584542, 95.391654, 0.5042615],
    ],
  },
  jupiter: { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], pm: [284.95, 870.536] },
  saturn: { ra: [40.589, -0.036], dec: [83.537, -0.004], pm: [38.9, 810.7939024] },
  uranus: { ra: [257.311, 0], dec: [-15.175, 0], pm: [203.81, -501.1600928] },
  neptune: {
    // N = 357.85 + 52.316 T
    ra: [299.36, 0],
    dec: [43.46, 0],
    pm: [249.978, 541.1397757],
    raTerms: [[0.7, 357.85, 52.316]],
    decTerms: [[-0.51, 357.85, 52.316]],
    pmTerms: [[-0.48, 357.85, 52.316]],
  },
  pluto: { ra: [132.993, 0], dec: [-6.163, 0], pm: [302.695, 56.3625225] },
};

/** Pole right ascension, declination and prime meridian angle, degrees, at a TDB Julian date. */
export function rotationAngles(
  id: RotatingId,
  jdTdb: number,
): { ra: number; dec: number; w: number } {
  const m = MODELS[id];
  const d = jdTdb - J2000;
  const T = d / 36525;
  return {
    ra: m.ra[0] + m.ra[1] * T + sum(m.raTerms ?? [], T, Math.sin),
    dec: m.dec[0] + m.dec[1] * T + sum(m.decTerms ?? [], T, Math.cos),
    w: m.pm[0] + m.pm[1] * d + sum(m.pmTerms ?? [], T, Math.sin),
  };
}

/** Frame rotation about z: expresses vectors in axes turned by `angle`. */
function rz(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

function rx(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * ICRF → body-fixed rotation: Rz(W) · Rx(90° − δ0) · Rz(90° + α0), the IAU convention (the
 * x axis passes through the node of the body's equator on the ICRF equator, then turns by W).
 */
export function icrfToBodyFixed(id: RotatingId, jdTdb: number): Mat3 {
  const { ra, dec, w } = rotationAngles(id, jdTdb);
  return multiply(rz(w * DEG), multiply(rx((90 - dec) * DEG), rz((90 + ra) * DEG)));
}
