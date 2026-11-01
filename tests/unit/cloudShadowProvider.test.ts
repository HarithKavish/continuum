import { describe, expect, it, vi } from 'vitest';

// The provider's only network access is through the cloud frames' shared source loader.
const sourceOpacity = vi.fn();
vi.mock('../../src/spatial/imagery/CloudFrameProvider', () => ({
  TILE: 256,
  CLOUD_MAX_LEVEL: 5,
  EUMETSAT_MAX_LEVEL: 3,
  sourceUrl: (_s: unknown, _t: string, x: number, y: number, z: number) => `${z}/${x}/${y}`,
  sourceOpacity: (...args: unknown[]) => sourceOpacity(...args),
}));

const { CloudShadowProvider } = await import('../../src/spatial/imagery/CloudShadowProvider');

describe('cloud shadow tiles', () => {
  it('fail when a source tile fails, so the layer retries instead of keeping a tile without shadows', async () => {
    sourceOpacity.mockRejectedValue(new Error('Cloud tile: HTTP 503'));
    const provider = new CloudShadowProvider('2026-11-01T18:00:00Z', {} as never, 0);
    await expect(provider.requestImage(9, 14, 5)).rejects.toThrow('HTTP 503');
  });

  it('read the neighbouring source tiles a shadow can reach across the tile edge', async () => {
    sourceOpacity.mockReset();
    sourceOpacity.mockRejectedValue(new Error('stop after collecting requests'));
    const provider = new CloudShadowProvider('2026-11-01T18:00:00Z', {} as never, 0);
    await provider.requestImage(9, 14, 5).catch(() => undefined);
    const urls = sourceOpacity.mock.calls.map((c) => c[1] as string);
    // GOES-East covers this tile at level 5; up to 150 km of shadow reaches the tiles around it.
    expect(urls).toContain('5/9/14');
    expect(urls).toEqual(expect.arrayContaining(['5/8/14', '5/10/14', '5/9/13', '5/9/15']));
  });
});
