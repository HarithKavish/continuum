import { describe, expect, it } from 'vitest';
import {
  convertEllipsoidalToOrthometric,
  CORRECTION,
  decodeTerrarium,
  fillIceSurfaceFromAncestor,
  fillSeaLevelFromAncestor,
  hornSlope,
  lonLatToTileFraction,
  mercatorPixelSpacingMeters,
  sampleBilinear,
  terrariumHeight,
  tileXToLon,
  tileYToLat,
  wrapTileX,
} from '../../src/spatial/terrain/terrarium';

describe('Terrarium decoding', () => {
  it('decodes the documented encoding (R*256 + G + B/256) - 32768', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(0, 0, 0)).toBe(-32768);
    expect(terrariumHeight(128, 1, 128)).toBe(1.5);
    // 8848 m = 41616 + 32768 offset -> R = 162, G = 144.
    expect(terrariumHeight(162, 144, 0)).toBe(8848);
    // Below sea level: Challenger Deep region, ~ -10 900 m.
    expect(terrariumHeight(85, 148, 0)).toBe(-10860);
  });

  it('decodes an RGBA buffer pixel by pixel, ignoring alpha', () => {
    const rgba = new Uint8ClampedArray([
      128, 0, 0, 255, 162, 144, 0, 0, 127, 255, 0, 255, 128, 10, 64, 255,
    ]);
    expect(Array.from(decodeTerrarium(rgba, 2, 2))).toEqual([0, 8848, -1, 10.25]);
  });
});

describe('Web Mercator tile arithmetic', () => {
  it('maps the origin to the centre of the zoom-1 grid', () => {
    expect(lonLatToTileFraction(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('inverts tile edges back to longitude and latitude', () => {
    expect(tileXToLon(0, 3)).toBe(-180);
    expect(tileXToLon(8, 3)).toBe(180);
    expect(tileYToLat(0, 0)).toBeCloseTo(85.0511287798, 9);
    const f = lonLatToTileFraction(86.925, 27.9881, 12);
    expect(tileXToLon(f.x, 12)).toBeCloseTo(86.925, 9);
    expect(tileYToLat(f.y, 12)).toBeCloseTo(27.9881, 9);
  });

  it('places Everest in the tile verified against the live service', () => {
    const f = lonLatToTileFraction(86.925, 27.9881, 12);
    expect([Math.floor(f.x), Math.floor(f.y)]).toEqual([3037, 1716]);
  });

  it('computes tile-grid pixel spacing from the equatorial circumference', () => {
    expect(mercatorPixelSpacingMeters(0, 0)).toBeCloseTo(156543.034, 2);
    expect(mercatorPixelSpacingMeters(0, 15)).toBeCloseTo(4.777, 3);
    expect(mercatorPixelSpacingMeters(60, 15)).toBeCloseTo(4.777 / 2, 3);
  });

  it('wraps tile columns across the antimeridian', () => {
    expect(wrapTileX(-1, 2)).toBe(3);
    expect(wrapTileX(4, 2)).toBe(0);
  });
});

describe('sampling', () => {
  const heights = new Float32Array([0, 10, 20, 30]); // 2x2

  it('returns pixel values at pixel centres', () => {
    expect(sampleBilinear(heights, 2, 0.5, 0.5)).toBe(0);
    expect(sampleBilinear(heights, 2, 1.5, 1.5)).toBe(30);
  });

  it('interpolates between pixel centres', () => {
    expect(sampleBilinear(heights, 2, 1, 0.5)).toBe(5);
    expect(sampleBilinear(heights, 2, 1, 1)).toBe(15);
  });

  it('clamps at the tile edge rather than extrapolating', () => {
    expect(sampleBilinear(heights, 2, 0, 0)).toBe(0);
    expect(sampleBilinear(heights, 2, 2, 2)).toBe(30);
  });
});

describe('Horn slope', () => {
  it('measures a 45° plane rising to the east, facing west', () => {
    const { slopeDeg, aspectDeg } = hornSlope([0, 1, 2, 0, 1, 2, 0, 1, 2], 1, 1);
    expect(slopeDeg).toBeCloseTo(45, 9);
    expect(aspectDeg).toBeCloseTo(270, 9);
  });

  it('measures a plane rising to the north as facing south', () => {
    // Row 0 is the northern row.
    const { aspectDeg } = hornSlope([2, 2, 2, 1, 1, 1, 0, 0, 0], 1, 1);
    expect(aspectDeg).toBeCloseTo(180, 9);
  });

  it('reports no aspect on flat ground', () => {
    expect(hornSlope([5, 5, 5, 5, 5, 5, 5, 5, 5], 30, 30)).toEqual({
      slopeDeg: 0,
      aspectDeg: null,
    });
  });

  it('scales with grid spacing', () => {
    expect(hornSlope([0, 1, 2, 0, 1, 2, 0, 1, 2], 10, 10).slopeDeg).toBeCloseTo(
      (Math.atan(0.1) * 180) / Math.PI,
      9,
    );
  });
});

describe('source corrections', () => {
  const size = 256;
  const blank = () => new Uint8Array(size * size);

  it('replaces exact-zero pixels with negative ancestor values and marks them', () => {
    const child = new Float32Array(size * size).fill(0);
    child[0] = 12; // genuine land stays untouched
    const ancestor = new Float32Array(size * size).fill(-4000);
    const mask = blank();
    const n = fillSeaLevelFromAncestor(
      child,
      { z: 11, x: 2, y: 3 },
      ancestor,
      { z: 10, x: 1, y: 1 },
      mask,
    );
    expect(n).toBe(size * size - 1);
    expect(child[0]).toBe(12);
    expect(child[1]).toBe(-4000);
    expect(mask[0]).toBe(0);
    expect(mask[1]).toBe(CORRECTION.bathymetry);
  });

  it('leaves sea-level pixels alone where the ancestor is not below sea level (coastal land at 0 m)', () => {
    const child = new Float32Array(size * size).fill(0);
    const ancestor = new Float32Array(size * size).fill(3);
    expect(
      fillSeaLevelFromAncestor(
        child,
        { z: 12, x: 0, y: 0 },
        ancestor,
        { z: 10, x: 0, y: 0 },
        blank(),
      ),
    ).toBe(0);
    expect(child.every((h) => h === 0)).toBe(true);
  });

  it('maps child pixels to the correct quadrant of the ancestor', () => {
    // Ancestor: west half -100 m, east half -200 m. Child z11 x=1 is the east half of z10 x=0.
    const ancestor = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) ancestor[y * size + x] = x < 128 ? -100 : -200;
    const child = new Float32Array(size * size).fill(0);
    fillSeaLevelFromAncestor(
      child,
      { z: 11, x: 1, y: 0 },
      ancestor,
      { z: 10, x: 0, y: 0 },
      blank(),
    );
    expect(child[10 * size + 10]).toBe(-200);
    const westChild = new Float32Array(size * size).fill(0);
    fillSeaLevelFromAncestor(
      westChild,
      { z: 11, x: 0, y: 0 },
      ancestor,
      { z: 10, x: 0, y: 0 },
      blank(),
    );
    expect(westChild[10 * size + 10]).toBe(-100);
  });

  it('restores the ice surface over bedrock only inside ice-sheet regions', () => {
    // z6 tile (x=40, y=58) lies around 75–78°S: Antarctica.
    const antarctic = { z: 6, x: 40, y: 58 };
    expect(tileYToLat(antarctic.y, 6)).toBeLessThan(-60);
    const bedrock = new Float32Array(size * size).fill(-94);
    const surfaceAncestor = new Float32Array(size * size).fill(3500);
    const mask = blank();
    const n = fillIceSurfaceFromAncestor(
      bedrock,
      antarctic,
      surfaceAncestor,
      { z: 3, x: 5, y: 7 },
      mask,
    );
    expect(n).toBe(size * size);
    expect(bedrock[0]).toBe(3500);
    expect(mask[0]).toBe(CORRECTION.iceSurface);

    // Same values on a tropical tile: untouched.
    const tropical = new Float32Array(size * size).fill(-94);
    expect(
      fillIceSurfaceFromAncestor(
        tropical,
        { z: 6, x: 40, y: 30 },
        surfaceAncestor,
        { z: 3, x: 5, y: 3 },
        blank(),
      ),
    ).toBe(0);
  });

  it('keeps bedrock where the ancestor surface is not meaningfully higher', () => {
    const child = new Float32Array(size * size).fill(1000);
    const ancestor = new Float32Array(size * size).fill(1030); // within the 50 m threshold
    expect(
      fillIceSurfaceFromAncestor(
        child,
        { z: 6, x: 40, y: 58 },
        ancestor,
        { z: 3, x: 5, y: 7 },
        blank(),
      ),
    ).toBe(0);
  });

  it('converts ArcticDEM land heights from ellipsoidal to orthometric and leaves the sea alone', () => {
    const heights = new Float32Array(size * size).fill(100);
    heights[5] = 0;
    heights[6] = -20;
    const mask = blank();
    const n = convertEllipsoidalToOrthometric(heights, { z: 10, x: 400, y: 200 }, () => 40, mask);
    expect(n).toBe(size * size - 2);
    expect(heights[0]).toBeCloseTo(60, 5);
    expect(heights[5]).toBe(0);
    expect(heights[6]).toBe(-20);
    expect(mask[0]).toBe(CORRECTION.arcticDem);
  });
});
