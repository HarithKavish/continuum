import { describe, expect, it } from 'vitest';
import {
  densifyPath,
  formatArea,
  formatDistance,
  geodesicInverse,
  polygonArea,
  polylineLengthMeters,
} from '../../src/spatial/measurements/geodesic';
import {
  decimalsForUncertainty,
  formatLatLon,
  formatLatLonDms,
  parseCoordinates,
} from '../../src/spatial/coordinates/coordinates';

describe('geodesic measurement (WGS84)', () => {
  it('reproduces the GeographicLib reference inverse problem (Wellington → Salamanca)', () => {
    const r = geodesicInverse({ lat: -41.32, lon: 174.81 }, { lat: 40.96, lon: -5.5 });
    expect(r.distanceMeters).toBeCloseTo(19959679.267, 2);
    expect(r.initialBearingDeg).toBeCloseTo(161.06766999, 6);
  });

  it('measures one degree of latitude at the equator as ~110.574 km, not 111.32 km', () => {
    expect(geodesicInverse({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }).distanceMeters).toBeCloseTo(
      110574.389,
      1,
    );
  });

  it('computes an ellipsoid octant as one eighth of the WGS84 surface area', () => {
    const totalArea = 510065621724088.5; // WGS84 ellipsoid surface, m²
    const octant = polygonArea([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 90 },
      { lat: 90, lon: 0 },
    ]);
    expect(octant.areaSquareMeters / (totalArea / 8)).toBeCloseTo(1, 9);
  });

  it('reports area independent of winding order', () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 },
      { lat: 0.01, lon: 0.01 },
      { lat: 0.01, lon: 0 },
    ];
    expect(polygonArea(square).areaSquareMeters).toBeCloseTo(
      polygonArea([...square].reverse()).areaSquareMeters,
      6,
    );
  });

  it('sums polyline legs', () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
    ];
    const expected =
      geodesicInverse(pts[0]!, pts[1]!).distanceMeters +
      geodesicInverse(pts[1]!, pts[2]!).distanceMeters;
    expect(polylineLengthMeters(pts)).toBeCloseTo(expected, 6);
  });

  it('densifies a path with evenly spaced samples including both ends', () => {
    const samples = densifyPath(
      [
        { lat: 10, lon: 10 },
        { lat: 10, lon: 11 },
      ],
      5,
    );
    expect(samples).toHaveLength(5);
    expect(samples[0]!.point.lon).toBeCloseTo(10, 9);
    expect(samples[4]!.point.lon).toBeCloseTo(11, 9);
    const total = samples[4]!.distanceMeters;
    expect(samples[2]!.distanceMeters).toBeCloseTo(total / 2, 6);
  });

  it('formats distances and areas with sensible units', () => {
    expect(formatDistance(0.5)).toBe('0.50 m');
    expect(formatDistance(1234)).toBe('1.23 km');
    expect(formatArea(500)).toBe('500 m²');
    expect(formatArea(25_000)).toBe('2.50 ha');
    expect(formatArea(3_500_000)).toBe('3.5 km²');
  });
});

describe('coordinate parsing', () => {
  it.each([
    ['27.9881, 86.925', 27.9881, 86.925],
    ['27.9881 86.925', 27.9881, 86.925],
    ['-33.8568, 151.2153', -33.8568, 151.2153],
    ['33.8568 S, 151.2153 E', -33.8568, 151.2153],
    ['S 33.8568, E 151.2153', -33.8568, 151.2153],
    ['27°59′17″N 86°55′30″E', 27 + 59 / 60 + 17 / 3600, 86 + 55 / 60 + 30 / 3600],
    ['40°26\'46"N, 79°58\'56"W', 40 + 26 / 60 + 46 / 3600, -(79 + 58 / 60 + 56 / 3600)],
    ['151.2153 E, 33.8568 S', -33.8568, 151.2153],
  ])('parses %s', (text, lat, lon) => {
    const p = parseCoordinates(text);
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(lat, 6);
    expect(p!.lon).toBeCloseTo(lon, 6);
  });

  it.each(['Kandy', '91, 0', '0, 181', '', '1 2 3', "10°61'N 5E"])('rejects %s', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });

  it('formats decimal degrees and DMS', () => {
    expect(formatLatLon({ lat: -33.85678, lon: 151.21533 }, 3)).toBe('33.857° S, 151.215° E');
    expect(formatLatLonDms({ lat: 27.988056, lon: 86.925278 })).toBe('27°59′17.0″N 86°55′31.0″E');
  });

  it('limits displayed decimals to the uncertainty of the source', () => {
    expect(decimalsForUncertainty(1)).toBe(6);
    expect(decimalsForUncertainty(30)).toBe(4);
    expect(decimalsForUncertainty(1000)).toBe(3);
  });
});
