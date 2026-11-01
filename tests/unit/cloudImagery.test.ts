import { describe, expect, it } from 'vitest';
import {
  altitudeFade,
  cloudFrameTimes,
  cloudOpacity,
  eumetsatTemperature,
  frameWeights,
  gibsTemperature,
  satelliteFor,
} from '../../src/spatial/imagery/cloudImagery';

describe('infrared decoding', () => {
  it('reads GIBS colours through the published colour map', () => {
    expect(gibsTemperature(255, 255, 255, 255)).toBeCloseTo(-91.6, 1); // first class
    expect(gibsTemperature(1, 1, 1, 255)).toBeCloseTo(56.9, 1); // last class
    expect(gibsTemperature(0, 0, 0, 0)).toBeNull(); // no data
  });

  it('gives resampled GIBS colours the temperature of the nearest class', () => {
    const exact = gibsTemperature(153, 153, 153, 255)!;
    expect(gibsTemperature(152, 154, 153, 255)).toBeCloseTo(exact, 1);
  });

  it('maps EUMETView grey with the fitted scale, black being outside the disk', () => {
    expect(eumetsatTemperature(0)).toBeNull();
    expect(eumetsatTemperature(70)).toBeCloseTo(0, 5);
    expect(eumetsatTemperature(255)).toBeCloseTo(-57.8, 1);
  });
});

describe('cloud opacity', () => {
  it('is clear from 0 °C up, opaque from −40 °C down, linear between', () => {
    expect(cloudOpacity(25)).toBe(0);
    expect(cloudOpacity(0)).toBe(0);
    expect(cloudOpacity(-20)).toBeCloseTo(0.5, 5);
    expect(cloudOpacity(-40)).toBe(1);
    expect(cloudOpacity(-80)).toBe(1);
    expect(cloudOpacity(null)).toBe(0);
  });
});

describe('satellite coverage', () => {
  it('draws each longitude from the nearest geostationary satellite', () => {
    const at = (lon: number) => satelliteFor(lon).name;
    expect(at(-120)).toBe('GOES-West');
    expect(at(-50)).toBe('GOES-East');
    expect(at(10)).toBe('Meteosat 0°');
    expect(at(76)).toBe('Meteosat Indian Ocean'); // Kerala
    expect(at(120)).toBe('Himawari');
  });

  it('splits across the antimeridian between Himawari and GOES-West', () => {
    expect(satelliteFor(179).name).toBe('Himawari');
    expect(satelliteFor(-179).name).toBe('Himawari'); // boundary at 178.25°W
    expect(satelliteFor(-175).name).toBe('GOES-West');
  });
});

describe('frame times', () => {
  it('are whole hours, the newest at least 45 minutes old', () => {
    expect(cloudFrameTimes(new Date('2026-11-01T10:44:00Z'), 3)).toEqual([
      '2026-11-01T07:00:00Z',
      '2026-11-01T08:00:00Z',
      '2026-11-01T09:00:00Z',
    ]);
    expect(cloudFrameTimes(new Date('2026-11-01T10:45:00Z'), 1)).toEqual(['2026-11-01T10:00:00Z']);
  });
});

describe('the loop', () => {
  it('always shows a whole frame’s worth of cloud', () => {
    for (let t = 0; t < 12; t += 0.13) {
      const sum = frameWeights(5, t).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('starts on the oldest frame and holds on the newest', () => {
    expect(frameWeights(5, 0)).toEqual([1, 0, 0, 0, 0]);
    // After four crossfades (2.8 s) the newest frame holds for 1.6 s.
    expect(frameWeights(5, 3.5)).toEqual([0, 0, 0, 0, 1]);
    expect(frameWeights(1, 99)).toEqual([1]);
  });

  it('fades out as the camera comes down, so clouds never hide the ground', () => {
    expect(altitudeFade(10_000_000)).toBe(1);
    expect(altitudeFade(1_500_000)).toBe(1);
    expect(altitudeFade(150_000)).toBe(0);
    expect(altitudeFade(2_000)).toBe(0);
    expect(altitudeFade(825_000)).toBeCloseTo(0.5, 5);
  });
});
