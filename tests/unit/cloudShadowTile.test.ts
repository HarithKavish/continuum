import { describe, expect, it, vi } from 'vitest';

// The shadows' only network access is through the clouds' shared source loader.
const sourceOpacity = vi.fn();
vi.mock('../../src/spatial/imagery/cloudSources', () => ({
  TILE: 256,
  EUMETSAT_MAX_LEVEL: 3,
  sourceOpacity: (...args: unknown[]) => sourceOpacity(...args),
}));

const { shadowAlpha, SHADOW_MIN_LEVEL } = await import('../../src/spatial/imagery/cloudShadowTile');
const sun = { lat: -14.5, lon: -95 };

describe('cloud shadow tiles', () => {
  it('fail when a source tile fails, so the layer retries instead of keeping a tile without shadows', async () => {
    sourceOpacity.mockRejectedValue(new Error('Cloud tile: HTTP 503'));
    await expect(shadowAlpha('2026-11-01T18:00:00Z', sun, 9, 14, 5, 0)).rejects.toThrow('HTTP 503');
  });

  it('read the neighbouring source tiles a shadow can reach across the tile edge', async () => {
    sourceOpacity.mockReset();
    sourceOpacity.mockResolvedValue(null);
    await shadowAlpha('2026-11-01T18:00:00Z', sun, 9, 14, 5, 0);
    const tiles = sourceOpacity.mock.calls.map((c) => `${c[4]}/${c[2]}/${c[3]}`);
    // Up to 150 km of shadow reaches the source tiles around this level-5 tile.
    expect(tiles).toContain('5/9/14');
    expect(tiles).toEqual(expect.arrayContaining(['5/8/14', '5/10/14', '5/9/13', '5/9/15']));
  });

  it('draw nothing at whole-Earth levels, where a shadow is under a pixel', async () => {
    sourceOpacity.mockReset();
    expect(await shadowAlpha('2026-11-01T18:00:00Z', sun, 1, 1, SHADOW_MIN_LEVEL - 1, 0)).toBe(
      null,
    );
    expect(sourceOpacity).not.toHaveBeenCalled();
  });
});
