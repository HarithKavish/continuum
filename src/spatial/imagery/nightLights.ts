// City lights on the night side (NASA Black Marble), drawn by Cesium's day/night alpha.

/** Provider of the lights, and the id of their layer in the imagery stack. */
export const NIGHT_LIGHTS_SOURCE = 'gibs-black-marble';
export const NIGHT_LIGHTS = 'night-lights';

/**
 * Cesium shades the night side at 30% of full light; the lights are drawn brighter by the
 * inverse so that, from afar, they keep the brightness NASA published them at.
 */
export const NIGHT_LIGHTS_BRIGHTNESS = 1 / 0.3;

const FULL_ABOVE_M = 800_000;
const GLOW_BELOW_M = 25_000;
const GLOW_ALPHA = 0.35;

/**
 * Black Marble's pixels are about 500 m across: from afar they are city lights, but close
 * up a city would be one bright blur over its streets. So the lights fade to a glow as the
 * camera descends, evenly in log height.
 */
export function nightLightsAlpha(cameraHeight: number): number {
  if (!(cameraHeight > GLOW_BELOW_M)) return GLOW_ALPHA;
  if (cameraHeight >= FULL_ABOVE_M) return 1;
  const t = Math.log(cameraHeight / GLOW_BELOW_M) / Math.log(FULL_ABOVE_M / GLOW_BELOW_M);
  return GLOW_ALPHA + (1 - GLOW_ALPHA) * t;
}
