// The solar system: where the bodies are, flying among them, and the clock.

import { expect, test, type Page } from '@playwright/test';
import { HORIZONS_POSITIONS } from '../unit/horizonsReference';
import {
  installFakeGamepad,
  padConnect,
  padTap,
  savedOverlays,
  setView,
  waitForEngine,
} from './helpers';

const AU = 149_597_870_700;

/** Wait until the camera is orbiting `focus` with no flight in progress. */
async function arrived(page: Page, focus: string | null) {
  await page.waitForFunction(
    (focus) => {
      const s = (window as any).continuum.engine.space;
      return s.focus === focus && !s.flying;
    },
    focus,
    { timeout: 60_000 },
  );
}

test.describe('solar system', () => {
  test.beforeEach(async ({ page }) => {
    // Borders only: space views need no Earth overlays loading underneath.
    await page.addInitScript(
      (prefs) => localStorage.setItem('continuum.preferences.v1', prefs),
      savedOverlays(['openfreemap-boundaries']),
    );
  });

  test('places the planets, the Sun and the Moon where JPL Horizons does', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    const ref = HORIZONS_POSITIONS['2026-11-01 00:00 TDB']!;
    // Stop the clock at that instant: Cesium counts TAI, and TDB = TAI + 32.184 s.
    await page.evaluate((jdTdb) => {
      const clock = (window as any).continuum.engine.viewer.clock;
      clock.shouldAnimate = false;
      // Cesium's JulianDate: whole Julian day number (days start at noon) and seconds.
      const tai = jdTdb - 32.184 / 86_400;
      clock.currentTime.dayNumber = Math.floor(tai);
      clock.currentTime.secondsOfDay = (tai - Math.floor(tai)) * 86_400;
      (window as any).continuum.engine.viewer.scene.requestRender();
    }, ref.jdTdb);
    await page.waitForFunction(
      (jd) => Math.abs((window as any).continuum.engine.solarSystem.tdbJulianDate - jd) < 1e-6,
      ref.jdTdb,
    );
    const icrf = await page.evaluate(() => {
      const system = (window as any).continuum.engine.solarSystem;
      const m = system.icrfToFixed; // column-major: ICRF = transpose × world
      const out: Record<string, [number, number, number]> = {};
      for (const id of [
        'sun',
        'mercury',
        'venus',
        'moon',
        'mars',
        'jupiter',
        'saturn',
        'uranus',
        'neptune',
        'pluto',
      ]) {
        const p = system.view(id).position;
        out[id] = [0, 1, 2].map(
          (i) => m[i * 3] * p.x + m[i * 3 + 1] * p.y + m[i * 3 + 2] * p.z,
        ) as [number, number, number];
      }
      return out;
    });
    const earth = ref.au['earth']!;
    const arcsec = (a: number[], b: number[]) => {
      const n = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
      const c = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (n(a) * n(b));
      return (Math.acos(Math.min(1, c)) * 180 * 3600) / Math.PI;
    };
    // Heliocentric errors allowed (twice JPL's nominal, Neptune as in the unit tests),
    // seen from Earth, plus 30″ for the Sun's place.
    const helioError: Record<string, number> = {
      mercury: 30,
      venus: 40,
      mars: 80,
      jupiter: 800,
      saturn: 1200,
      uranus: 100,
      neptune: 60,
      pluto: 1,
    };
    const measured: string[] = [];
    for (const [id, bound] of Object.entries(helioError)) {
      const helio = ref.au[id]!;
      const expected = [0, 1, 2].map((k) => helio[k]! - earth[k]!);
      const ours = icrf[id]!.map((v) => v / AU);
      const scale = Math.hypot(...helio) / Math.hypot(...expected);
      const error = arcsec(ours, expected);
      measured.push(`${id} ${error.toFixed(1)}″`);
      expect(error, id).toBeLessThan(bound * scale + 30);
    }
    const sun = arcsec(
      icrf['sun']!,
      earth.map((v) => -v),
    );
    // The Moon, from Cesium's series (Simon et al. 1994, section 4: mean elements), against
    // Horizons' geocentric Moon: measured 570″ (0.16°) at this instant.
    const moon = arcsec(icrf['moon']!, ref.moonKm);
    measured.push(`sun ${sun.toFixed(1)}″`, `moon ${moon.toFixed(1)}″`);
    test.info().annotations.push({ type: 'seen from Earth', description: measured.join(', ') });
    expect(sun, 'sun').toBeLessThan(30);
    expect(moon, 'moon').toBeLessThan(900);
  });

  test('flies to Mars with its USGS map, then back to Earth', async ({ page }) => {
    const maps: string[] = [];
    page.on('response', (r) => {
      if (r.ok() && r.url().includes('planetarymaps.usgs.gov')) maps.push(r.url());
    });
    await page.goto('/');
    await waitForEngine(page);
    await page.getByRole('button', { name: 'Mars', exact: true }).click();
    await arrived(page, 'mars');
    const distance = await page.evaluate(() => {
      const e = (window as any).continuum.engine;
      const p = e.solarSystem.view('mars').position;
      const c = e.viewer.camera.positionWC;
      return Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    });
    expect(distance / 3_396_190).toBeCloseTo(4, 1); // four radii from the centre
    await expect
      .poll(() => maps.some((u) => u.includes('MDIM21_color')), { timeout: 60_000 })
      .toBe(true);
    await expect(page.locator('.statusbar')).toContainText('Mars ·');
    // Cesium's own mouse controls are off in space, back on at Earth.
    expect(
      await page.evaluate(
        () =>
          (window as any).continuum.engine.viewer.scene.screenSpaceCameraController.enableInputs,
      ),
    ).toBe(false);
    await page.getByRole('button', { name: 'Back to Earth' }).click();
    await arrived(page, null);
    expect(
      await page.evaluate(
        () =>
          (window as any).continuum.engine.viewer.scene.screenSpaceCameraController.enableInputs,
      ),
    ).toBe(true);
  });

  test('runs the clock faster, and back to now', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    await page.getByRole('button', { name: '1 day/s' }).click();
    const multiplier = () =>
      page.evaluate(() => (window as any).continuum.engine.viewer.clock.multiplier);
    expect(await multiplier()).toBe(86_400);
    // The status bar says the clock is not showing now, and returns to it.
    const away = page.locator('.statusbar').getByRole('button', { name: /UTC/ });
    await expect(away).toBeVisible();
    await away.click();
    expect(await multiplier()).toBe(1);
    await expect(away).toHaveCount(0);
  });

  test('scrolling out past the highest Earth view continues into space', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    await setView(page, 78, 12, 60_000_000);
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 400);
    await arrived(page, 'earth');
    // ] steps to the next body after Earth: the Moon.
    await page.keyboard.press(']');
    await arrived(page, 'moon');
  });

  test('a controller steps through the bodies and brings the camera home', async ({ page }) => {
    await installFakeGamepad(page);
    await page.goto('/');
    await waitForEngine(page);
    await padConnect(page);
    await page.getByRole('button', { name: 'Venus', exact: true }).click();
    await arrived(page, 'venus');
    await padTap(page, 15); // D-pad right: the next body out
    await arrived(page, 'earth');
    await padTap(page, 5); // right bumper: time runs faster
    expect(
      await page.evaluate(() => (window as any).continuum.engine.viewer.clock.multiplier),
    ).toBe(60);
    await padTap(page, 3); // Y: back to Earth's own controls
    await arrived(page, null);
  });
});
