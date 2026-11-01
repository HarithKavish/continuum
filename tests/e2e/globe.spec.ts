// Acceptance tests against the production build, using the live public providers.
// They verify behaviour a user would see, and the architectural constraints (browser-only,
// no persistence, documented hosts only).

import { expect, test } from '@playwright/test';
import { ALLOWED_HOSTS, camera, setView, waitForEngine } from './helpers';

test.describe('globe, data and architecture', () => {
  test('renders real terrain and imagery with visible attribution', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const okImagery: string[] = [];
    page.on('response', (r) => {
      if (r.ok() && r.url().includes('tiles.maps.eox.at')) okImagery.push(r.url());
    });
    await page.goto('/');
    await waitForEngine(page);
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as any).continuum.engine.terrainProvider.activity.delivered),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);
    await expect.poll(() => okImagery.length, { timeout: 60_000 }).toBeGreaterThan(0);
    const credits = page.locator('.credits');
    await expect(credits).toContainText('Terrain Tiles');
    await expect(credits).toContainText('EOxCloudless');
    await expect(credits).toBeVisible();
    // Terrain is Cesium's real provider, not the flat ellipsoid.
    const terrainIsReal = await page.evaluate(() => {
      const e = (window as any).continuum.engine;
      return e.viewer.scene.terrainProvider === e.terrainProvider;
    });
    expect(terrainIsReal).toBe(true);
    expect(errors).toEqual([]);
  });

  test('draws borders and place names from OpenFreeMap vector tiles for each zoom', async ({
    page,
  }) => {
    const vectorTiles: string[] = [];
    page.on('response', (r) => {
      if (r.ok() && /tiles\.openfreemap\.org\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf/.test(r.url()))
        vectorTiles.push(r.url());
    });
    await page.goto('/');
    await waitForEngine(page);
    const active: string[] = await page.evaluate(() =>
      (window as any).continuum.engine.imagery.activeProviderIds(),
    );
    expect(active).toEqual(
      expect.arrayContaining(['openfreemap-boundaries', 'openfreemap-places']),
    );
    await setView(page, 76.3, 9.95, 90_000); // regional view over Kochi
    // The regional view draws regional data (zoom 9–14), not a coarse tile magnified.
    await expect
      .poll(() => vectorTiles.some((u) => /\/planet\/[^/]+\/(9|1[0-4])\//.test(u)), {
        timeout: 60_000,
      })
      .toBe(true);
    await expect(page.locator('.credits')).toContainText('OpenStreetMap');
  });

  test('loads USGS earthquakes and NASA EONET events into normalised records', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    const counts = () =>
      page.evaluate(() => {
        const records = [...(window as any).continuum.engine.feeds.records.values()];
        return Math.min(
          records.filter((r: any) => r.kind === 'earthquake').length,
          records.filter((r: any) => r.kind === 'natural-event').length,
        );
      });
    // Both feeds must have delivered at least one record.
    await expect.poll(counts, { timeout: 60_000 }).toBeGreaterThan(0);
    const sample = await page.evaluate(() => {
      const records = [...(window as any).continuum.engine.feeds.records.values()];
      const q = records.find((r: any) => r.kind === 'earthquake');
      return { count: records.length, q };
    });
    expect(sample.count).toBeGreaterThan(0);
    expect(sample.q.providerId).toBe('usgs-earthquakes');
    expect(sample.q.sourceRecordId).toBeTruthy();
    expect(new Date(sample.q.time).toISOString()).toBe(sample.q.time);
    expect(sample.q.attribution).toContain('Geological Survey');
  });

  test('every request goes to the app, the shared design system, or a catalogued provider', async ({
    page,
  }) => {
    const hosts = new Set<string>();
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.protocol.startsWith('http')) hosts.add(url.host);
    });
    await page.goto('/');
    await waitForEngine(page);
    await setView(page, 86.925, 27.9881, 40_000, -45);
    await page.waitForTimeout(8_000);
    const unexpected = [...hosts].filter((h) => !ALLOWED_HOSTS.has(h));
    expect(unexpected).toEqual([]);
  });

  test('stores no provider data in the browser', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    await page.waitForTimeout(8_000);
    const storage = await page.evaluate(async () => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      idb: 'databases' in indexedDB ? (await indexedDB.databases()).map((d) => d.name) : [],
    }));
    // Only the reader's own preferences and the shared design system's theme store.
    for (const key of storage.local)
      expect(key === 'continuum.preferences.v1' || key.startsWith('hk.')).toBe(true);
    expect(storage.session).toEqual([]);
    expect(storage.idb).toEqual([]);
  });

  test('shows the source catalogue with licences, attribution and rejected sources', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sources', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Sources and attribution' });
    await expect(dialog).toBeVisible();
    for (const name of [
      'Terrain Tiles (Terrarium)',
      'GEBCO 2026 bathymetry',
      'USGS earthquakes',
      'NASA EONET natural events',
    ]) {
      await expect(dialog.getByRole('heading', { name })).toBeVisible();
    }
    await expect(dialog).toContainText('Not integrated yet');
    await expect(dialog).toContainText('Copernicus DEM GLO-30');
    await expect(dialog).toContainText('Not stated');
  });

  test('explains when WebGL is unavailable instead of failing silently', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return (original as any).call(this, type, ...rest);
      } as typeof original;
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('WebGL is not available');
  });

  test('camera starts with the whole Earth in view', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    const c = await camera(page);
    expect(c.height).toBeGreaterThan(10_000_000);
  });
});
