import type { Page } from '@playwright/test';
import { IMAGERY_LAYERS } from '../../src/config/providers/layers';

/** Saved preferences with exactly these overlays on: every other overlay deliberately off. */
export function savedOverlays(overlays: string[]): string {
  const knownOverlays = IMAGERY_LAYERS.filter((l) => l.role === 'overlay').map((l) => l.providerId);
  return JSON.stringify({ overlays, knownOverlays });
}

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
  'view.eumetsat.int',
  'stac.overturemaps.org',
  'overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com',
  'data.geopf.fr',
  'service.pdok.nl',
  'wmts.geo.admin.ch',
  'mapsneu.wien.gv.at',
  'planetarymaps.usgs.gov',
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

/**
 * Wait until the engine's input loop has sampled the controller `count` more times. Under
 * the software renderer CI uses, a frame that is still uploading tiles can hold the loop for
 * many seconds (a 30 s wait timed out once on runway, 2026-11-01, and passed on rerun), so
 * this allows as long as the other loading waits.
 */
export async function waitInputFrames(page: Page, count = 2) {
  const start = await page.evaluate(() => (window as any).continuum.engine.inputFrames as number);
  await page.waitForFunction(
    (target) => (window as any).continuum.engine.inputFrames >= target,
    start + count,
    {
      timeout: 90_000,
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

/**
 * Where the Sun is overhead at `date`, from the Astronomical Almanac's low-precision solar
 * coordinates (about 0.01°) and Greenwich mean sidereal time: independent of Cesium.
 */
export function subsolarPoint(date: Date): { lon: number; lat: number } {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const anomaly = (357.528 + 0.9856003 * n) * rad;
  const lambda = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * rad;
  const obliquity = (23.439 - 0.0000004 * n) * rad;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(lambda), Math.cos(lambda));
  const gmst = 280.46061837 + 360.98564736629 * n;
  const lon = ((((rightAscension / rad - gmst) % 360) + 540) % 360) - 180;
  return { lon, lat: declination / rad };
}

/** Mean brightness (0–255) of a square of the rendered page centred on the screen centre. */
export async function centreBrightness(page: Page, size = 120): Promise<number> {
  const viewport = page.viewportSize()!;
  const png = await page.screenshot({
    clip: {
      x: viewport.width / 2 - size / 2,
      y: viewport.height / 2 - size / 2,
      width: size,
      height: size,
    },
    timeout: 120_000,
  });
  return page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), {
      width: image.width,
      height: image.height,
    });
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
    return sum / (px.length / 4);
  }, png.toString('base64'));
}

/** Wait until every visible terrain and imagery tile has loaded (or give up quietly). */
export async function waitForTiles(page: Page, timeout = 60_000): Promise<void> {
  await page
    .waitForFunction(() => (window as any).continuum.engine.viewer.scene.globe.tilesLoaded, null, {
      timeout,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}
