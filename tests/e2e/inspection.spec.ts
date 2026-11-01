// Point inspection, accuracy metadata and measurement, against live data.

import { expect, test, type Page } from '@playwright/test';
import { setView, waitForEngine } from './helpers';

async function inspect(page: Page, lat: number, lon: number) {
  await page.evaluate(
    ({ lat, lon }) => (window as any).continuum.engine.useLocation({ lat, lon }),
    { lat, lon },
  );
  const panel = page.getByTestId('point-inspection');
  await expect(panel).toBeVisible();
  return panel;
}

function elevationRow(page: Page) {
  return page.locator('.row', { hasText: 'Elevation (orthometric)' }).locator('dd');
}

async function readMetres(text: string): Promise<number> {
  return Number(text.replace(/[^\d.-]/g, ''));
}

test.describe('inspector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
  });

  test('reports Everest from SRTM with provenance, datum and independent sources', async ({
    page,
  }) => {
    await setView(page, 86.925, 27.9881, 30_000);
    const panel = await inspect(page, 27.9881, 86.925);
    await expect(elevationRow(page)).toContainText(' m', { timeout: 60_000 });
    const value = await readMetres((await elevationRow(page).textContent()) ?? '');
    // SRTM smooths the summit (surveyed 8 848.86 m); a value in this band is the real tile data.
    expect(value).toBeGreaterThan(8_400);
    expect(value).toBeLessThan(8_900);
    await expect(panel).toContainText('NASA SRTM');
    await expect(panel).toContainText('EGM96 geoid');
    await expect(panel).toContainText('Geoid undulation N');
    await expect(panel).toContainText('not the source resolution');
    await expect(panel).toContainText('WGS84 geographic (EPSG:4326)');
    // Independent Copernicus GLO-90 value via Open-Meteo.
    const copernicus = panel.locator('.source-card', { hasText: 'Copernicus DEM GLO-90' });
    await expect(copernicus).toContainText('EGM2008', { timeout: 30_000 });
  });

  test('shows real ETOPO1 depth at the Challenger Deep rather than sea-level fill', async ({
    page,
  }) => {
    await setView(page, 142.5917, 11.3733, 60_000);
    const panel = await inspect(page, 11.3733, 142.5917);
    await expect(elevationRow(page)).toContainText(' m', { timeout: 60_000 });
    const value = await readMetres((await elevationRow(page).textContent()) ?? '');
    expect(value).toBeLessThan(-9_000);
    await expect(panel).toContainText('ETOPO1 bathymetry from the zoom-');
    await expect(panel).toContainText('Below sea level');
  });

  test('converts ArcticDEM ellipsoidal heights to orthometric (Reykjavík)', async ({ page }) => {
    await setView(page, -21.94, 64.13, 30_000);
    const panel = await inspect(page, 64.13, -21.94);
    await expect(elevationRow(page)).toContainText(' m', { timeout: 60_000 });
    const value = await readMetres((await elevationRow(page).textContent()) ?? '');
    // The raw tile reads ~78 m here (ellipsoidal); Copernicus GLO-90 reads 12 m.
    expect(value).toBeLessThan(40);
    await expect(panel).toContainText('ArcticDEM heights in this tile are WGS84 ellipsoidal');
  });

  test('marks polar points as outside terrain coverage', async ({ page }) => {
    await inspect(page, -89, 0);
    await expect(page.getByTestId('point-inspection')).toContainText('beyond ±85.05°');
  });

  test('selects an earthquake record with its source identifiers', async ({ page }) => {
    await expect
      .poll(() => page.evaluate(() => (window as any).continuum.engine.feeds.records.size), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      const { engine } = (window as any).continuum;
      const record = [...engine.feeds.records.values()].find((r: any) => r.kind === 'earthquake');
      (window as any).__record = record;
      engine.flyTo(record.lat, record.lon, { height: 500_000 });
    });
    // Select through the search box, which matches loaded events by id.
    const id = await page.evaluate(() => (window as any).__record.sourceRecordId);
    await page.getByLabel('Search places, coordinates or loaded events').fill(id);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('list', { name: 'Search results' }).getByRole('button').first().click();
    const details = page.getByTestId('record-inspection');
    await expect(details).toBeVisible();
    await expect(details).toContainText(id);
    await expect(details).toContainText('Hypocentre depth');
    await expect(details.getByRole('link', { name: 'USGS event page' })).toHaveAttribute(
      'href',
      /earthquake\.usgs\.gov/,
    );
  });
});

test.describe('measurement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
  });

  const add = (page: Page, lat: number, lon: number) =>
    page.evaluate(({ lat, lon }) => (window as any).continuum.engine.useLocation({ lat, lon }), {
      lat,
      lon,
    });

  test('measures a geodesic distance on the ellipsoid', async ({ page }) => {
    await page.getByRole('radio', { name: 'Distance' }).click();
    await add(page, 0, 0);
    await add(page, 0, 1);
    // One degree of longitude on the WGS84 equator is 111.319 km.
    await expect(page.locator('.row', { hasText: 'Path length (geodesic)' })).toContainText(
      '111 km',
    );
  });

  test('measures an area on the ellipsoid', async ({ page }) => {
    await page.getByRole('radio', { name: 'Area' }).click();
    await add(page, 0, 0);
    await add(page, 0, 0.01);
    await add(page, 0.01, 0.01);
    await add(page, 0.01, 0);
    // ~1.113 km × 1.106 km ≈ 1.23 km².
    await expect(page.locator('.row', { hasText: 'Area (ellipsoidal)' })).toContainText(
      /1\.2[23] km²/,
    );
  });

  test('draws an elevation profile across a real mountain', async ({ page }) => {
    await page.getByRole('radio', { name: 'Profile' }).click();
    await add(page, 46.53, 7.9);
    await add(page, 46.6, 8.05);
    const chart = page.locator('.profile-chart');
    await expect(chart).toBeVisible({ timeout: 90_000 });
    const caption = (await chart.locator('figcaption').textContent()) ?? '';
    const max = Number(/max (\d+)/.exec(caption)?.[1]);
    expect(max).toBeGreaterThan(2_500); // the Bernese Alps
  });
});
