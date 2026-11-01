import type { Page } from '@playwright/test';

/** Hosts Continuum may contact: its own origin, the shared design system, and catalogued providers. */
export const ALLOWED_HOSTS = new Set([
  'localhost:4173',
  'continuum.harithkavish.com',
  'harithkavish.com',
  's3.amazonaws.com',
  'tiles.maps.eox.at',
  'gibs.earthdata.nasa.gov',
  'basemap.nationalmap.gov',
  'wms.gebco.net',
  'tiles.openfreemap.org',
  'earthquake.usgs.gov',
  'eonet.gsfc.nasa.gov',
  'api.open-meteo.com',
  'epqs.nationalmap.gov',
  'gis.ngdc.noaa.gov',
  'nominatim.openstreetmap.org',
  // Not the app: Cloudflare injects its Web Analytics beacon into every harithkavish.com
  // page at the edge (a zone-wide setting), so it appears only on the deployed site.
  'static.cloudflareinsights.com',
]);

export async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { continuum?: unknown }).continuum, null, {
    timeout: 90_000,
  });
}

/** Place the camera directly (degrees, metres, degrees). */
export async function setView(
  page: Page,
  lon: number,
  lat: number,
  height: number,
  pitchDeg = -90,
  headingDeg = 0,
) {
  await page.evaluate(
    ({ lon, lat, height, pitchDeg, headingDeg }) =>
      (window as any).continuum.engine.jumpTo(lon, lat, height, headingDeg, pitchDeg),
    { lon, lat, height, pitchDeg, headingDeg },
  );
  // Let the teleport frame render before tests read the camera.
  await page.waitForTimeout(300);
}

export interface CameraState {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
}

export async function camera(page: Page): Promise<CameraState> {
  return page.evaluate(() => {
    const c = (window as any).continuum.engine.viewer.camera;
    const p = c.positionCartographic;
    const deg = (r: number) => (r * 180) / Math.PI;
    return {
      lon: deg(p.longitude),
      lat: deg(p.latitude),
      height: p.height,
      heading: deg(c.heading),
      pitch: deg(c.pitch),
    };
  });
}

/**
 * Emulates a W3C "standard" mapping gamepad. Installed before the page loads; tests drive
 * it through window.__pad and the helpers below.
 */
export async function installFakeGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'Continuum Test Controller (STANDARD GAMEPAD)',
      index: 0,
      mapping: 'standard',
      connected: false,
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [pad.connected ? pad : null],
      configurable: true,
    });
    (window as any).__padConnect = (on: boolean) => {
      pad.connected = on;
      const event = new Event(on ? 'gamepadconnected' : 'gamepaddisconnected');
      (event as any).gamepad = pad;
      window.dispatchEvent(event);
    };
  });
}

export async function padConnect(page: Page, on = true) {
  await page.evaluate((on) => (window as any).__padConnect(on), on);
}

export async function padAxes(page: Page, axes: [number, number, number, number]) {
  await page.evaluate((axes) => ((window as any).__pad.axes = axes), axes);
}

export async function padButton(page: Page, index: number, value: number) {
  await page.evaluate(
    ({ index, value }) => {
      const b = (window as any).__pad.buttons[index];
      b.value = value;
      b.pressed = value > 0.5;
    },
    { index, value },
  );
}

/** Wait until the engine's input loop has sampled the controller `count` more times. */
export async function waitInputFrames(page: Page, count = 2) {
  const start = await page.evaluate(() => (window as any).continuum.engine.inputFrames as number);
  await page.waitForFunction(
    (target) => (window as any).continuum.engine.inputFrames >= target,
    start + count,
    {
      timeout: 30_000,
    },
  );
}

/**
 * Press and release a button. The Gamepad API reports only current state, so the press is
 * held until the input loop has seen it — at the few frames per second of a software
 * renderer a fixed short delay can fall between two polls.
 */
export async function padTap(page: Page, index: number) {
  await padButton(page, index, 1);
  await waitInputFrames(page);
  await padButton(page, index, 0);
  await waitInputFrames(page);
}

export async function headingNearNorth(page: Page): Promise<number> {
  const c = await camera(page);
  return Math.min(c.heading, 360 - c.heading);
}
