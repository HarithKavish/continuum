// Acceptance tests against the production build, using the live public providers.
// They verify behaviour a user would see, and the architectural constraints (browser-only,
// no persistence, documented hosts only).

import { expect, test } from '@playwright/test';
import { ALLOWED_HOSTS, camera, savedOverlays, setView, waitForEngine } from './helpers';

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

  test('adds aerial photos, building footprints and roads close up', async ({ page }) => {
    const hits = { aerial: 0, footprints: 0, roads: 0 };
    page.on('response', (r) => {
      const url = r.url();
      if (!r.ok()) return;
      if (url.includes('data.geopf.fr/wmts')) hits.aerial++;
      // Overture's archive is read in byte ranges, never downloaded whole.
      if (url.includes('overturemaps-extras') && r.status() === 206) hits.footprints++;
      if (/tiles\.openfreemap\.org\/planet\/[^/]+\/14\//.test(url)) hits.roads++;
    });
    await page.goto('/');
    await waitForEngine(page);
    await setView(page, 2.2945, 48.8584, 1_500); // the Champ de Mars, Paris
    await expect.poll(() => hits.aerial, { timeout: 90_000 }).toBeGreaterThan(0);
    await expect.poll(() => hits.footprints, { timeout: 90_000 }).toBeGreaterThan(0);
    await expect.poll(() => hits.roads, { timeout: 90_000 }).toBeGreaterThan(0);
    await expect(page.locator('.credits')).toContainText('IGN');
    await expect(page.locator('.credits')).toContainText('Overture');
  });

  test('draws points of interest close up, and lakes and rivers regionally, in Tamil Nadu', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForEngine(page);
    // Every map overlay is drawn by one layer; it counts what it has drawn.
    const stats = () => page.evaluate(() => (window as any).continuum.engine.imagery.mapStats());
    // T. Nagar, Chennai: stations, hospitals, temples and shops from OpenStreetMap.
    await setView(page, 80.2339, 13.0418, 1_200);
    await expect.poll(async () => (await stats()).pois, { timeout: 90_000 }).toBeGreaterThan(0);
    // Greater Chennai: its reservoirs and tanks, the Adyar and the Cooum.
    await setView(page, 80.15, 13.05, 40_000);
    await expect
      .poll(async () => (await stats()).waterAreas, { timeout: 90_000 })
      .toBeGreaterThan(0);
    expect((await stats()).waterways).toBeGreaterThan(0);
  });

  test('shows the latest clouds from EUMETSAT and NASA GIBS, and replays the last hours', async ({
    page,
  }) => {
    const urls = { eumetsat: [] as string[], gibs: 0 };
    page.on('response', (r) => {
      if (!r.ok()) return;
      if (r.url().includes('view.eumetsat.int/geoserver/wms')) urls.eumetsat.push(r.url());
      if (r.url().includes('Band13_Clean_Infrared')) urls.gibs++;
    });
    await page.addInitScript(
      (prefs) => localStorage.setItem('continuum.preferences.v1', prefs),
      savedOverlays(['geostationary-clouds']),
    );
    await page.goto('/');
    await waitForEngine(page);
    // India and the Indian Ocean: Meteosat Indian Ocean to the west, Himawari to the east.
    await setView(page, 85, 15, 9_000_000);
    await expect.poll(() => urls.eumetsat.length, { timeout: 90_000 }).toBeGreaterThan(0);
    await expect.poll(() => urls.gibs, { timeout: 90_000 }).toBeGreaterThan(0);
    const frames = () =>
      page.evaluate(
        (): { time: string; alpha: number; show: boolean; shadows: boolean; layer: number }[] => {
          const engine = (window as any).continuum.engine;
          return [...engine.imagery.active.values()]
            .find((a: any) => a.clouds)
            .clouds.frames.filter((f: any) => !f.retiring)
            .map((f: any) => ({
              time: f.time,
              alpha: f.layer.alpha,
              show: f.layer.show,
              shadows: f.provider.shadows,
              layer: engine.viewer.imageryLayers.indexOf(f.layer),
            }));
        },
      );
    // By default only the latest hour is loaded and shown: one layer, nothing looping.
    const latest = await frames();
    expect(latest).toHaveLength(1);
    // Whole hours only: EUMETSAT's hourly imagery is the licence-free real-time cadence.
    expect(latest[0]!.time).toMatch(/T\d\d:00:00Z$/);
    for (const url of urls.eumetsat) expect(url).toMatch(/time=\d{4}-\d\d-\d\dT\d\d:00:00Z/);
    // Under realistic lighting the frame draws its clouds' shadows in the same layer.
    expect(latest[0]!.shadows).toBe(true);
    const fetchedBeforeReplay = urls.eumetsat.length;
    // Replay loads the four hours before it, and loops all five.
    await page.locator('summary', { hasText: 'Weather' }).click();
    await page.getByRole('button', { name: 'Replay 4 hours' }).click();
    await expect.poll(async () => (await frames()).length).toBe(5);
    const times = (await frames()).map((f) => f.time);
    expect(new Set(times).size).toBe(5);
    expect(times.at(-1)).toBe(latest[0]!.time);
    await expect
      .poll(() => urls.eumetsat.length, { timeout: 90_000 })
      .toBeGreaterThan(fetchedBeforeReplay);
    await page.getByRole('button', { name: 'Show latest' }).click();
    await expect.poll(async () => (await frames()).length).toBe(1);
    // Clouds fade out near the ground, so they never hide streets and houses.
    await setView(page, 76.28, 9.97, 20_000);
    await expect
      .poll(async () => (await frames()).every((f) => !f.show || f.alpha === 0), {
        timeout: 30_000,
      })
      .toBe(true);
  });

  test('switches on overlays added since a reader saved their choices', async ({ page }) => {
    // What a release before #8 saved, with place names switched off: it never saw roads,
    // buildings, aerial photos or clouds, so those must start at their defaults (on).
    await page.addInitScript(() =>
      localStorage.setItem(
        'continuum.preferences.v1',
        JSON.stringify({ overlays: ['openfreemap-boundaries'] }),
      ),
    );
    await page.goto('/');
    await waitForEngine(page);
    const active: string[] = await page.evaluate(() =>
      (window as any).continuum.engine.imagery.activeProviderIds(),
    );
    expect(active).toEqual(
      expect.arrayContaining([
        'openfreemap-boundaries',
        'openfreemap-roads',
        'overture-buildings',
        'ign-orthophotos',
        'geostationary-clouds',
      ]),
    );
    expect(active).not.toContain('openfreemap-places');
    // Saved again with every overlay now offered, so later additions are told apart.
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('continuum.preferences.v1')!),
    );
    expect(saved.knownOverlays).toEqual(
      expect.arrayContaining(['openfreemap-places', 'openfreemap-roads', 'geostationary-clouds']),
    );
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
