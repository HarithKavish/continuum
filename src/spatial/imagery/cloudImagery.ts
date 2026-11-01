// Live clouds from geostationary infrared imagery: how each source's pixels decode to a
// brightness temperature, how temperature becomes cloud opacity, which satellite draws
// which longitudes, and which frame times exist. Pure functions; CloudFrameProvider does
// the fetching and drawing.

/**
 * GIBS colour map "Clean_Longwave_Infrared_Window_Band" (v1.3), used by the GOES-East,
 * GOES-West and Himawari Band 13 layers: r, g, b, then the class midpoint in tenths of a
 * degree Celsius. Copied from
 * https://gibs.earthdata.nasa.gov/colormaps/v1.3/Clean_Longwave_Infrared_Window_Band.xml
 * (retrieved 2026-11-01; 238 classes from −91.6 °C to 56.9 °C and above).
 */
// prettier-ignore
const GIBS_IR_TABLE = [
  255, 255, 255, -916, 127, 0, 127, -906, 140, 13, 135, -896, 153, 25, 142, -886, 165, 38, 150,
  -876, 178, 51, 157, -866, 191, 64, 165, -856, 204, 76, 173, -846, 217, 89, 180, -836, 229,
  102, 188, -826, 242, 114, 195, -816, 255, 127, 203, -806, 230, 230, 230, -796, 204, 204, 204,
  -786, 177, 177, 177, -776, 155, 155, 155, -766, 129, 129, 129, -756, 102, 102, 102, -746, 76,
  76, 76, -736, 54, 54, 54, -726, 27, 27, 27, -716, 5, 5, 5, -706, 26, 0, 0, -696, 51, 0, 0,
  -686, 77, 0, 0, -676, 102, 0, 0, -666, 128, 0, 0, -656, 153, 0, 0, -646, 179, 0, 0, -636,
  204, 0, 0, -626, 230, 0, 0, -616, 255, 0, 0, -606, 255, 26, 0, -596, 255, 51, 0, -586, 255,
  77, 0, -576, 255, 102, 0, -566, 255, 128, 0, -556, 255, 153, 0, -546, 255, 179, 0, -536, 255,
  204, 0, -526, 255, 230, 0, -516, 255, 255, 0, -506, 230, 255, 0, -496, 204, 255, 0, -486,
  179, 255, 0, -476, 153, 255, 0, -466, 128, 255, 0, -456, 102, 255, 0, -446, 77, 255, 0, -436,
  51, 255, 0, -426, 26, 255, 0, -416, 0, 255, 0, -406, 0, 234, 10, -396, 0, 212, 19, -386, 0,
  191, 29, -376, 0, 170, 38, -366, 0, 149, 48, -356, 0, 128, 58, -346, 0, 106, 67, -336, 0, 85,
  77, -326, 0, 64, 86, -316, 0, 42, 96, -308, 0, 21, 105, -304, 0, 0, 115, -298, 0, 0, 125,
  -294, 0, 13, 122, -288, 0, 26, 129, -284, 0, 38, 136, -278, 0, 51, 143, -274, 0, 64, 150,
  -268, 0, 76, 157, -264, 0, 89, 164, -258, 0, 102, 171, -254, 0, 115, 178, -248, 0, 128, 185,
  -244, 0, 140, 192, -238, 0, 153, 199, -234, 0, 166, 206, -228, 0, 178, 213, -224, 0, 191,
  220, -218, 0, 204, 227, -214, 0, 217, 234, -208, 0, 230, 241, -204, 0, 242, 248, -198, 0,
  255, 255, -194, 197, 197, 197, -188, 196, 196, 196, -184, 194, 194, 194, -178, 193, 193, 193,
  -174, 192, 192, 192, -168, 191, 191, 191, -164, 189, 189, 189, -158, 188, 188, 188, -154,
  187, 187, 187, -148, 185, 185, 185, -144, 184, 184, 184, -138, 183, 183, 183, -134, 181, 181,
  181, -128, 180, 180, 180, -124, 179, 179, 179, -118, 178, 178, 178, -114, 176, 176, 176,
  -108, 175, 175, 175, -104, 174, 174, 174, -98, 172, 172, 172, -94, 171, 171, 171, -88, 170,
  170, 170, -84, 169, 169, 169, -78, 167, 167, 167, -74, 166, 166, 166, -68, 165, 165, 165,
  -64, 163, 163, 163, -58, 162, 162, 162, -54, 161, 161, 161, -48, 159, 159, 159, -44, 158,
  158, 158, -38, 157, 157, 157, -34, 156, 156, 156, -28, 154, 154, 154, -24, 153, 153, 153,
  -18, 152, 152, 152, -14, 150, 150, 150, -8, 149, 149, 149, -4, 148, 148, 148, 2, 147, 147,
  147, 6, 145, 145, 145, 12, 144, 144, 144, 16, 143, 143, 143, 22, 141, 141, 141, 26, 140, 140,
  140, 32, 139, 139, 139, 36, 138, 138, 138, 42, 136, 136, 136, 46, 135, 135, 135, 52, 134,
  134, 134, 56, 132, 132, 132, 62, 131, 131, 131, 66, 130, 130, 130, 72, 128, 128, 128, 76,
  127, 127, 127, 82, 126, 126, 126, 86, 125, 125, 125, 92, 123, 123, 123, 96, 122, 122, 122,
  102, 121, 121, 121, 106, 119, 119, 119, 112, 118, 118, 118, 116, 117, 117, 117, 122, 116,
  116, 116, 126, 114, 114, 114, 132, 113, 113, 113, 136, 112, 112, 112, 142, 110, 110, 110,
  146, 109, 109, 109, 152, 108, 108, 108, 156, 106, 106, 106, 162, 105, 105, 105, 166, 104,
  104, 104, 172, 103, 103, 103, 176, 101, 101, 101, 182, 100, 100, 100, 186, 99, 99, 99, 192,
  97, 97, 97, 196, 96, 96, 96, 202, 95, 95, 95, 206, 94, 94, 94, 212, 92, 92, 92, 216, 91, 91,
  91, 222, 90, 90, 90, 226, 88, 88, 88, 232, 87, 87, 87, 236, 86, 86, 86, 242, 84, 84, 84, 246,
  83, 83, 83, 252, 82, 82, 82, 256, 81, 81, 81, 262, 79, 79, 79, 266, 78, 78, 78, 272, 77, 77,
  77, 276, 75, 75, 75, 282, 74, 74, 74, 286, 73, 73, 73, 292, 72, 72, 72, 296, 70, 70, 70, 302,
  69, 69, 69, 306, 68, 68, 68, 312, 66, 66, 66, 316, 65, 65, 65, 322, 64, 64, 64, 326, 62, 62,
  62, 332, 61, 61, 61, 336, 60, 60, 60, 342, 59, 59, 59, 346, 57, 57, 57, 352, 56, 56, 56, 356,
  55, 55, 55, 362, 53, 53, 53, 366, 52, 52, 52, 372, 51, 51, 51, 376, 50, 50, 50, 382, 48, 48,
  48, 386, 47, 47, 47, 392, 46, 46, 46, 396, 44, 44, 44, 402, 43, 43, 43, 406, 42, 42, 42, 412,
  41, 41, 41, 416, 39, 39, 39, 422, 38, 38, 38, 426, 37, 37, 37, 432, 35, 35, 35, 436, 34, 34,
  34, 442, 33, 33, 33, 446, 31, 31, 31, 452, 30, 30, 30, 456, 29, 29, 29, 462, 28, 28, 28, 466,
  26, 26, 26, 472, 25, 25, 25, 476, 24, 24, 24, 482, 22, 22, 22, 486, 21, 21, 21, 492, 20, 20,
  20, 496, 19, 19, 19, 502, 17, 17, 17, 506, 16, 16, 16, 512, 15, 15, 15, 516, 13, 13, 13, 522,
  12, 12, 12, 526, 11, 11, 11, 532, 9, 9, 9, 536, 8, 8, 8, 542, 7, 7, 7, 546, 6, 6, 6, 552, 4,
  4, 4, 556, 3, 3, 3, 562, 2, 2, 2, 566, 1, 1, 1, 569,
];

const gibsTemperatures = new Map<number, number>();
for (let i = 0; i < GIBS_IR_TABLE.length; i += 4)
  gibsTemperatures.set(
    (GIBS_IR_TABLE[i]! << 16) | (GIBS_IR_TABLE[i + 1]! << 8) | GIBS_IR_TABLE[i + 2]!,
    GIBS_IR_TABLE[i + 3]! / 10,
  );

/** The temperature of the colour-map class nearest in RGB, for colours GIBS resampled. */
function nearestGibsTemperature(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < GIBS_IR_TABLE.length; i += 4) {
    const d =
      (GIBS_IR_TABLE[i]! - r) ** 2 +
      (GIBS_IR_TABLE[i + 1]! - g) ** 2 +
      (GIBS_IR_TABLE[i + 2]! - b) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = GIBS_IR_TABLE[i + 3]! / 10;
    }
  }
  return best;
}

/**
 * Brightness temperature (°C) of a GIBS infrared pixel, or null for no data. GIBS builds
 * its lower zooms by resampling, so a quarter of a zoom-3 tile's pixels are blends that
 * are not in the colour map (measured 2026-11-01); those take the nearest class.
 */
export function gibsTemperature(r: number, g: number, b: number, a: number): number | null {
  if (a === 0) return null;
  const key = (r << 16) | (g << 8) | b;
  let celsius = gibsTemperatures.get(key);
  if (celsius === undefined) {
    celsius = nearestGibsTemperature(r, g, b);
    gibsTemperatures.set(key, celsius);
  }
  return celsius;
}

/**
 * Brightness temperature (°C) of a EUMETView IR10.8 pixel, or null outside the disk.
 * EUMETView publishes these as greyscale with no scale. The mapping was fitted against
 * Himawari Band 13 from GIBS over the Bay of Bengal, where both satellites see the same
 * clouds (2026-11-01 08:00 UTC, 67 424 pixel pairs): grey ≈ 70 − 3.2 × T, so black is
 * about +22 °C and white about −58 °C. Black is also the colour of space beyond the disk.
 */
export function eumetsatTemperature(grey: number): number | null {
  return grey === 0 ? null : (70 - grey) / 3.2;
}

/**
 * Infrared at or above this temperature is drawn as clear sky. Higher thresholds turned
 * cold ground into haze: November land at 41–66°N reads 0–10 °C.
 */
export const CLEAR_SKY_C = 0;
/** Infrared at or below this temperature is drawn as fully opaque cloud. */
export const OPAQUE_CLOUD_C = -40;

/**
 * Display opacity for a brightness temperature: a linear ramp from clear at CLEAR_SKY_C
 * to opaque at OPAQUE_CLOUD_C. A display rule, not a measured cloud fraction: warm low
 * cloud and fog are missed, and very cold ground (polar or high-mountain winter) reads as
 * cloud.
 */
export function cloudOpacity(celsius: number | null): number {
  if (celsius === null) return 0;
  return Math.min(1, Math.max(0, (CLEAR_SKY_C - celsius) / (CLEAR_SKY_C - OPAQUE_CLOUD_C)));
}

export type CloudSource = { kind: 'gibs'; layer: string } | { kind: 'eumetsat'; layer: string };

export interface Satellite {
  name: string;
  /** Sub-satellite longitude, degrees east. */
  longitude: number;
  source: CloudSource;
}

/** Five geostationary satellites around the equator, west to east. */
export const SATELLITES: Satellite[] = [
  {
    name: 'GOES-West',
    longitude: -137.2,
    source: { kind: 'gibs', layer: 'GOES-West_ABI_Band13_Clean_Infrared' },
  },
  {
    name: 'GOES-East',
    longitude: -75.2,
    source: { kind: 'gibs', layer: 'GOES-East_ABI_Band13_Clean_Infrared' },
  },
  { name: 'Meteosat 0°', longitude: 0, source: { kind: 'eumetsat', layer: 'msg_fes:ir108' } },
  {
    name: 'Meteosat Indian Ocean',
    longitude: 45.5,
    source: { kind: 'eumetsat', layer: 'msg_iodc:ir108' },
  },
  {
    name: 'Himawari',
    longitude: 140.7,
    source: { kind: 'gibs', layer: 'Himawari_AHI_Band13_Clean_Infrared' },
  },
];

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * The satellite that draws a longitude: the one whose sub-satellite point is nearest,
 * so each draws the middle of its own view, where its imagery is least oblique.
 */
export function satelliteFor(lon: number): Satellite {
  let best = SATELLITES[0]!;
  let bestDistance = Infinity;
  for (const s of SATELLITES) {
    const d = Math.abs(wrap(lon - s.longitude));
    if (d < bestDistance) {
      bestDistance = d;
      best = s;
    }
  }
  return best;
}

/**
 * Minutes between frames. Every source publishes on the hour, and EUMETSAT's data policy
 * (since 15 January 2019) makes hourly Meteosat imagery free of licensing in real time,
 * whereas its 15-minute imagery is free only three hours after sensing.
 */
export const FRAME_STEP_MINUTES = 60;
/** How far behind real time a frame is assumed published by every source. */
export const PUBLISH_DELAY_MINUTES = 45;

/** The `count` most recent frame times, oldest first, as ISO 8601 UTC strings. */
export function cloudFrameTimes(now: Date, count: number): string[] {
  const step = FRAME_STEP_MINUTES * 60_000;
  const latest = Math.floor((now.getTime() - PUBLISH_DELAY_MINUTES * 60_000) / step) * step;
  return Array.from({ length: count }, (_, i) =>
    new Date(latest - (count - 1 - i) * step).toISOString().replace('.000Z', 'Z'),
  );
}

// ------------------------------------------------------------------ the loop

/** Seconds to crossfade from one frame to the next. */
const STEP_SECONDS = 0.7;
/** Seconds the newest frame stays on screen before the loop restarts. */
const HOLD_SECONDS = 1.6;
/** Clouds fade out between these camera heights (metres), so they never hide the ground. */
const FADE_OUT_BELOW = 150_000;
const FULL_ABOVE = 1_500_000;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Weight of each frame at `seconds` into the loop (the weights sum to 1). */
export function frameWeights(count: number, seconds: number): number[] {
  const weights = new Array<number>(count).fill(0);
  if (count === 1) {
    weights[0] = 1;
    return weights;
  }
  const forward = (count - 1) * STEP_SECONDS;
  const cycle = forward + HOLD_SECONDS + STEP_SECONDS;
  const t = ((seconds % cycle) + cycle) % cycle;
  if (t < forward) {
    const i = Math.floor(t / STEP_SECONDS);
    const f = smooth((t - i * STEP_SECONDS) / STEP_SECONDS);
    weights[i] = 1 - f;
    weights[i + 1] = f;
  } else if (t < forward + HOLD_SECONDS) {
    weights[count - 1] = 1;
  } else {
    const f = smooth((t - forward - HOLD_SECONDS) / STEP_SECONDS);
    weights[count - 1] = 1 - f;
    weights[0] = f;
  }
  return weights;
}

/** How visible clouds are at a camera height: 0 close to the ground, 1 from orbit. */
export function altitudeFade(height: number): number {
  return Math.min(1, Math.max(0, (height - FADE_OUT_BELOW) / (FULL_ABOVE - FADE_OUT_BELOW)));
}
