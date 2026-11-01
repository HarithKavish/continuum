// Day and night from the Sun's real position, and the switch to full daylight.

import { expect, test } from '@playwright/test';
import {
  centreBrightness,
  savedOverlays,
  setView,
  subsolarPoint,
  waitForEngine,
  waitForTiles,
} from './helpers';

test.describe('day and night', () => {
  test('lights the globe from where the Sun is now, and switches to full daylight', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // The precise ICRF-to-Earth rotation: Cesium's IAU 2006 tables, from the app's own origin.
    const orientation: string[] = [];
    page.on('response', (r) => {
      if (r.ok() && r.url().includes('/cesium/Assets/IAU2006_XYS/')) orientation.push(r.url());
    });
    // No overlays: only the imagery and the lighting decide the brightness.
    await page.addInitScript(
      (prefs) => localStorage.setItem('continuum.preferences.v1', prefs),
      savedOverlays([]),
    );
    await page.goto('/');
    await waitForEngine(page);

    // Realistic by default, on a clock that runs in real time.
    const clock = () =>
      page.evaluate(() => {
        const c = (window as any).continuum.engine.viewer.clock;
        return Date.parse(c.currentTime.toString()) - Date.now();
      });
    expect(Math.abs(await clock())).toBeLessThan(5_000);
    await page.waitForTimeout(2_000);
    expect(Math.abs(await clock())).toBeLessThan(5_000);
    const lighting = page.getByRole('button', { name: 'Realistic day and night (L)' });
    await expect(lighting).toHaveAttribute('aria-pressed', 'true');

    await expect.poll(() => orientation.length).toBeGreaterThan(0);

    const sun = subsolarPoint(new Date());
    const night = { lon: sun.lon > 0 ? sun.lon - 180 : sun.lon + 180, lat: -sun.lat };
    const brightnessAt = async (p: { lon: number; lat: number }) => {
      await setView(page, p.lon, p.lat, 20_000_000);
      await waitForTiles(page);
      return centreBrightness(page);
    };
    const day = await brightnessAt(sun);
    const dark = await brightnessAt(night);
    expect(day).toBeGreaterThan(dark * 2);

    // City lights are drawn on the night side only.
    const active: string[] = await page.evaluate(() =>
      (window as any).continuum.engine.imagery.activeProviderIds(),
    );
    expect(active).toContain('night-lights');

    // Full daylight: the night side is lit too, and the lights are gone.
    await lighting.click();
    await expect(lighting).toHaveAttribute('aria-pressed', 'false');
    await waitForTiles(page);
    const lit = await centreBrightness(page);
    test.info().annotations.push({
      type: 'brightness',
      description: `subsolar ${day.toFixed(1)}, antisolar ${dark.toFixed(1)}, antisolar in full daylight ${lit.toFixed(1)}`,
    });
    expect(lit).toBeGreaterThan(dark * 2);
    expect(
      await page.evaluate(() => (window as any).continuum.engine.imagery.activeProviderIds()),
    ).not.toContain('night-lights');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('continuum.preferences.v1')!),
    );
    expect(saved.lighting).toBe(false);
  });
});
