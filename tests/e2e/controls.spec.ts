// Gamepad and keyboard navigation, driven through an emulated standard-mapping controller.

import { expect, test } from '@playwright/test';
import {
  camera,
  headingNearNorth,
  installFakeGamepad,
  padAxes,
  padButton,
  padConnect,
  padTap,
  setView,
  waitForEngine,
} from './helpers';

test.describe('gamepad', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeGamepad(page);
    await page.goto('/');
    await waitForEngine(page);
    await setView(page, 10, 45, 2_000_000);
  });

  test('is detected, and disconnecting it is harmless', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const status = page.getByRole('button', { name: /Controller/ });
    await expect(status).toContainText('None');
    await padConnect(page);
    await expect(status).toContainText('Connected');
    await padAxes(page, [0, -1, 0, 0]);
    await page.waitForTimeout(300);
    await padConnect(page, false);
    await expect(status).toContainText('None');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('left stick pans; inside the dead zone nothing drifts', async ({ page }) => {
    await padConnect(page);
    const start = await camera(page);
    await padAxes(page, [0.08, -0.1, 0.07, 0.09]); // magnitudes 0.13 and 0.11: inside the 0.15 radial dead zone
    await page.waitForTimeout(1500);
    const idle = await camera(page);
    expect(Math.abs(idle.lat - start.lat)).toBeLessThan(1e-9);
    expect(Math.abs(idle.lon - start.lon)).toBeLessThan(1e-9);

    await padAxes(page, [0, -1, 0, 0]); // push up: forward, i.e. north at heading 0
    await page.waitForTimeout(1500);
    await padAxes(page, [0, 0, 0, 0]);
    await page.waitForTimeout(800);
    const moved = await camera(page);
    expect(moved.lat).toBeGreaterThan(start.lat + 1);
    expect(Math.abs(moved.height - start.height) / start.height).toBeLessThan(0.05);

    // Once released, motion decays to a complete stop (smoothing time constant 0.12 s).
    await page.waitForTimeout(1500);
    const a = await camera(page);
    await page.waitForTimeout(800);
    const b = await camera(page);
    expect(Math.abs(b.lat - a.lat)).toBeLessThan(1e-9);
  });

  test('triggers zoom in and out', async ({ page }) => {
    await padConnect(page);
    const start = await camera(page);
    await padButton(page, 7, 1); // RT
    await page.waitForTimeout(1200);
    await padButton(page, 7, 0);
    await page.waitForTimeout(500);
    const closer = await camera(page);
    expect(closer.height).toBeLessThan(start.height * 0.6);
    await padButton(page, 6, 1); // LT
    await page.waitForTimeout(1200);
    await padButton(page, 6, 0);
    await page.waitForTimeout(500);
    expect((await camera(page)).height).toBeGreaterThan(closer.height * 1.5);
  });

  test('right stick rotates around the target and tilts within limits', async ({ page }) => {
    await padConnect(page);
    const start = await camera(page);
    await padAxes(page, [0, 0, 1, 0]);
    await page.waitForTimeout(1000);
    await padAxes(page, [0, 0, 0, 0]);
    await page.waitForTimeout(500);
    const rotated = await camera(page);
    const turned = Math.abs(((rotated.heading - start.heading + 540) % 360) - 180);
    expect(turned).toBeGreaterThan(20);

    await padAxes(page, [0, 0, 0, -1]); // push up: tilt towards the horizon
    await page.waitForTimeout(1500);
    await padAxes(page, [0, 0, 0, 0]);
    await page.waitForTimeout(500);
    const tilted = await camera(page);
    expect(tilted.pitch).toBeGreaterThan(start.pitch + 15);
    // Holding tilt for a long time must not flip the camera past the horizon.
    await padAxes(page, [0, 0, 0, -1]);
    await page.waitForTimeout(4000);
    await padAxes(page, [0, 0, 0, 0]);
    await page.waitForTimeout(400);
    expect((await camera(page)).pitch).toBeLessThan(0);
  });

  test('buttons: A selects, B goes back, Y recentres, bumpers change speed, Start pauses', async ({
    page,
  }) => {
    await padConnect(page);
    await padTap(page, 0); // A
    await expect(page.getByTestId('point-inspection')).toBeVisible();
    await padTap(page, 1); // B
    await expect(page.getByTestId('point-inspection')).toBeHidden();

    await padTap(page, 5); // RB
    await expect(page.locator('.statusbar__item', { hasText: 'Speed' })).toContainText('×2');
    await padTap(page, 4); // LB
    await expect(page.locator('.statusbar__item', { hasText: 'Speed' })).toContainText('×1');

    await padAxes(page, [0, 0, 1, 0]);
    await page.waitForTimeout(800);
    await padAxes(page, [0, 0, 0, 0]);
    await padTap(page, 3); // Y: recentre north-up (a 1.2 s flight; slower under software rendering)
    await expect.poll(() => headingNearNorth(page), { timeout: 30_000 }).toBeLessThan(2);

    await padTap(page, 9); // Start: pause
    await expect(page.getByRole('button', { name: /Controller/ })).toContainText('Paused');
    const before = await camera(page);
    await padAxes(page, [0, -1, 0, 0]);
    await page.waitForTimeout(1000);
    await padAxes(page, [0, 0, 0, 0]);
    const after = await camera(page);
    expect(Math.abs(after.lat - before.lat)).toBeLessThan(1e-9);
    await padTap(page, 9); // resume
    await expect(page.getByRole('button', { name: /Controller/ })).toContainText('Connected');
  });

  test('X toggles the information panel', async ({ page }) => {
    await padConnect(page);
    const panel = page.locator('#info-panel');
    const wasVisible = await panel.isVisible();
    await padTap(page, 2);
    await expect(panel).toBeVisible({ visible: !wasVisible });
  });

  test('controls can be rebound and survive a reload', async ({ page }) => {
    await padConnect(page);
    await page.getByRole('button', { name: /Controller/ }).click();
    await page.getByRole('tab', { name: 'Controller setup' }).click();
    const row = page.locator('tr', { hasText: 'Select location' });
    await row.getByRole('button', { name: 'Rebind' }).click();
    await padTap(page, 3); // bind "select" to Y
    await expect(row).toContainText('Y');
    await page.reload();
    await waitForEngine(page);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('continuum.preferences.v1') ?? '{}'),
    );
    expect(stored.controls.buttons.select).toEqual({ type: 'button', index: 3 });
  });
});

test.describe('keyboard', () => {
  test('WASD pans and H recentres', async ({ page }) => {
    await page.goto('/');
    await waitForEngine(page);
    await setView(page, 10, 45, 2_000_000, -90, 30);
    await page
      .locator('.globe')
      .click({ position: { x: 5, y: 400 } })
      .catch(() => undefined);
    const start = await camera(page);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(600);
    const moved = await camera(page);
    expect(Math.hypot(moved.lat - start.lat, moved.lon - start.lon)).toBeGreaterThan(1);
    await page.keyboard.press('KeyH');
    await expect.poll(() => headingNearNorth(page), { timeout: 30_000 }).toBeLessThan(2);
  });
});
