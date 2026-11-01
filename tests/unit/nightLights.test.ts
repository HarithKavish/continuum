import { describe, expect, it } from 'vitest';
import { nightLightsAlpha } from '../../src/spatial/imagery/nightLights';

describe('night lights', () => {
  it('are drawn in full from afar and fade to a glow close to the ground', () => {
    expect(nightLightsAlpha(20_000_000)).toBe(1);
    expect(nightLightsAlpha(800_000)).toBe(1);
    expect(nightLightsAlpha(25_000)).toBeCloseTo(0.35);
    expect(nightLightsAlpha(3_000)).toBeCloseTo(0.35);
    const mid = nightLightsAlpha(Math.sqrt(800_000 * 25_000)); // halfway in log height
    expect(mid).toBeCloseTo((1 + 0.35) / 2);
  });

  it('never fades below the glow, even for unknown heights', () => {
    expect(nightLightsAlpha(-50)).toBeCloseTo(0.35);
    expect(nightLightsAlpha(Number.NaN)).toBeCloseTo(0.35);
  });

  it('only fades as the camera descends', () => {
    let previous = Infinity;
    for (let h = 2_000_000; h > 1_000; h /= 1.5) {
      const a = nightLightsAlpha(h);
      expect(a).toBeLessThanOrEqual(previous);
      previous = a;
    }
  });
});
