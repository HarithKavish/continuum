// Geodesic measurement on the WGS84 ellipsoid, using GeographicLib (C. F. F. Karney,
// "Algorithms for geodesics", J. Geodesy 87, 2013). Distances are accurate to a few
// nanometres and areas to a few square millimetres per vertex — far below any data source
// Continuum displays, so measurement error is dominated by where points were placed.

import { Geodesic, PolygonArea } from 'geographiclib-geodesic';

export interface LonLat {
  lon: number;
  lat: number;
}

const wgs84 = Geodesic.WGS84;

export interface InverseResult {
  distanceMeters: number;
  /** Forward azimuth at the first point, degrees clockwise from north. */
  initialBearingDeg: number;
  finalBearingDeg: number;
}

export function geodesicInverse(a: LonLat, b: LonLat): InverseResult {
  const r = wgs84.Inverse(a.lat, a.lon, b.lat, b.lon) as {
    s12: number;
    azi1: number;
    azi2: number;
  };
  return {
    distanceMeters: r.s12,
    initialBearingDeg: (r.azi1 + 360) % 360,
    finalBearingDeg: (r.azi2 + 360) % 360,
  };
}

export function polylineLengthMeters(points: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += geodesicInverse(points[i - 1]!, points[i]!).distanceMeters;
  return total;
}

export interface PolygonMeasurement {
  areaSquareMeters: number;
  perimeterMeters: number;
  vertices: number;
}

/** Area enclosed by geodesic edges joining the vertices, on the WGS84 ellipsoid. */
export function polygonArea(points: LonLat[]): PolygonMeasurement {
  const polygon = new PolygonArea.PolygonArea(wgs84, false);
  for (const p of points) polygon.AddPoint(p.lat, p.lon);
  // sign=true reports a signed area within ±half the ellipsoid, so the magnitude is the
  // enclosed region whichever way the user drew the ring. (sign=false treats clockwise
  // rings as enclosing the rest of the Earth.)
  const result = polygon.Compute(false, true) as {
    number: number;
    perimeter: number;
    area: number;
  };
  return {
    areaSquareMeters: Math.abs(result.area),
    perimeterMeters: result.perimeter,
    vertices: result.number,
  };
}

/** Evenly spaced points along the geodesics joining the vertices (inclusive of ends). */
export function densifyPath(
  points: LonLat[],
  samples: number,
): { point: LonLat; distanceMeters: number }[] {
  if (points.length < 2) return points.map((p) => ({ point: p, distanceMeters: 0 }));
  const legs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const line = wgs84.InverseLine(a.lat, a.lon, b.lat, b.lon);
    const length = (line as unknown as { s13: number }).s13;
    legs.push({ line, start: total, length });
    total += length;
  }
  const out: { point: LonLat; distanceMeters: number }[] = [];
  for (let k = 0; k < samples; k++) {
    const d = samples === 1 ? 0 : (total * k) / (samples - 1);
    const leg = legs.find((l) => d <= l.start + l.length + 1e-6) ?? legs[legs.length - 1]!;
    const pos = leg.line.Position(Math.min(leg.length, d - leg.start)) as {
      lat2: number;
      lon2: number;
    };
    out.push({ point: { lat: pos.lat2, lon: normaliseLon(pos.lon2) }, distanceMeters: d });
  }
  return out;
}

function normaliseLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1) return `${meters.toFixed(2)} m`;
  if (meters < 1000) return `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
  if (meters < 100_000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters / 1000).toLocaleString('en')} km`;
}

export function formatArea(squareMeters: number): string {
  if (!Number.isFinite(squareMeters)) return '—';
  if (squareMeters < 10_000) return `${squareMeters.toFixed(0)} m²`;
  if (squareMeters < 1_000_000) return `${(squareMeters / 10_000).toFixed(2)} ha`;
  return `${(squareMeters / 1_000_000).toLocaleString('en', { maximumFractionDigits: squareMeters < 1e8 ? 2 : 0 })} km²`;
}
