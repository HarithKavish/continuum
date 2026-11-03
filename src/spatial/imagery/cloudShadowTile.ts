// The shadows of one frame's clouds on one tile, so clouds read as floating above the land.
// Each pixel takes the cloud whose shadow falls on it: towards the Sun (its position at the
// frame's time), by the cloud top's height over the tangent of the Sun's elevation. Height
// comes from the cloud-top temperature (cloudShadow.ts), found in two steps because it
// depends on the cloud being looked for. Reads the frame's own decoded source tiles, plus
// neighbours where a shadow crosses a tile edge.

import { tileXToLon, tileYToLat } from '../terrain/terrarium';
import { EUMETSAT_MAX_LEVEL, sourceOpacity, TILE } from './cloudSources';
import { satelliteFor, type Satellite } from './cloudImagery';
import {
  cloudTopHeightKm,
  MAX_SHADOW_OFFSET,
  shadowOffset,
  SHADOW_STRENGTH,
  sunAt,
} from './cloudShadow';

const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6_378_137;
/** Shadows are drawn from this level: coarser, an offset of tens of km is under a pixel. */
export const SHADOW_MIN_LEVEL = 4;
/** First guess at a cloud top's height, km, before the cloud itself is found. */
const FIRST_GUESS_KM = 6;

/** Opacity (0–1) of one satellite's source, sampled at global pixel coordinates of a level. */
type Sampler = (x: number, y: number) => number;

/**
 * Shadow darkness (0–255) for each pixel of a tile, or null above SHADOW_MIN_LEVEL. A failed
 * source request rejects, so the tile is retried rather than kept with shadows missing.
 */
export async function shadowAlpha(
  time: string,
  sun: { lat: number; lon: number },
  x: number,
  y: number,
  level: number,
  priority: number,
): Promise<Uint8Array | null> {
  if (level < SHADOW_MIN_LEVEL) return null;
  const scale = TILE * 2 ** level; // global pixels across the world at this level
  // The tile, widened by the longest shadow at its poleward edge, in global pixels.
  const poleward = Math.max(Math.abs(tileYToLat(y, level)), Math.abs(tileYToLat(y + 1, level)));
  const metresPerPixel = (EARTH_CIRCUMFERENCE * Math.cos((poleward * Math.PI) / 180)) / scale;
  const margin = Math.ceil(MAX_SHADOW_OFFSET / Math.max(metresPerPixel, 1));
  const samplers = await samplersAround(time, x, y, level, margin, priority);

  const alpha = new Uint8Array(TILE * TILE);
  const at = (gx: number, gy: number) => {
    const lon = (gx / scale) * 360 - 180;
    return samplers.get(satelliteFor(((lon + 540) % 360) - 180))?.(gx, gy) ?? 0;
  };
  for (let py = 0; py < TILE; py++) {
    const gy = y * TILE + py + 0.5;
    const lat = tileYToLat(gy / TILE, level);
    const mpp = (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / scale;
    for (let px = 0; px < TILE; px++) {
      const gx = x * TILE + px + 0.5;
      const position = sunAt(lat, tileXToLon(gx / TILE, level), sun);
      let height = FIRST_GUESS_KM;
      let opacity = 0;
      for (let step = 0; step < 2; step++) {
        const d = shadowOffset(height, position.elevation);
        if (d === null) break;
        // The shadow-casting cloud lies towards the Sun: east is +x, north is −y.
        opacity = at(
          gx + (d * Math.sin(position.azimuth)) / mpp,
          gy - (d * Math.cos(position.azimuth)) / mpp,
        );
        if (opacity === 0) break;
        height = cloudTopHeightKm(opacity);
      }
      alpha[py * TILE + px] = Math.round(255 * opacity * SHADOW_STRENGTH);
    }
  }
  return alpha;
}

/** For each satellite seen around the tile, a sampler over its decoded source tiles. */
async function samplersAround(
  time: string,
  x: number,
  y: number,
  level: number,
  margin: number,
  priority: number,
): Promise<Map<Satellite, Sampler>> {
  const n = 2 ** level;
  const left = x * TILE - margin;
  const right = (x + 1) * TILE + margin;
  const satellites = new Set<Satellite>();
  for (let gx = left; gx <= right; gx++)
    satellites.add(satelliteFor((((gx / (TILE * n)) * 360 - 180 + 540) % 360) - 180));
  const result = new Map<Satellite, Sampler>();
  await Promise.all(
    [...satellites].map(async (s) => {
      const z = s.source.kind === 'eumetsat' ? Math.min(level, EUMETSAT_MAX_LEVEL) : level;
      const shift = 2 ** (level - z);
      const m = 2 ** z;
      // Source tiles covering the widened tile, at the source's own level.
      const tiles = new Map<string, Uint8Array | null>();
      const x0 = Math.floor(left / shift / TILE);
      const x1 = Math.floor(right / shift / TILE);
      const y0 = Math.max(0, Math.floor((y * TILE - margin) / shift / TILE));
      const y1 = Math.min(m - 1, Math.floor(((y + 1) * TILE + margin) / shift / TILE));
      const jobs: Promise<void>[] = [];
      for (let tx = x0; tx <= x1; tx++)
        for (let ty = y0; ty <= y1; ty++) {
          const wx = ((tx % m) + m) % m;
          // null is a source with no data there (no cloud); a failure rejects.
          jobs.push(
            sourceOpacity(s.source, time, wx, ty, z, priority).then(
              (grid) => void tiles.set(`${wx}/${ty}`, grid),
            ),
          );
        }
      await Promise.all(jobs);
      const width = TILE * m;
      /** One source pixel (integer coordinates at the source level), wrapped east–west. */
      const pixel = (ix: number, iy: number): number => {
        if (iy < 0 || iy >= width) return 0;
        const wx = ((ix % width) + width) % width;
        const grid = tiles.get(`${Math.floor(wx / TILE)}/${Math.floor(iy / TILE)}`);
        return grid ? grid[(iy % TILE) * TILE + (wx % TILE)]! / 255 : 0;
      };
      result.set(s, (gx, gy) => {
        // Global pixel at this level → the source's level, interpolated between pixel
        // centres (across source-tile edges too).
        const sx = gx / shift - 0.5;
        const sy = gy / shift - 0.5;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;
        return (
          (pixel(ix, iy) * (1 - fx) + pixel(ix + 1, iy) * fx) * (1 - fy) +
          (pixel(ix, iy + 1) * (1 - fx) + pixel(ix + 1, iy + 1) * fx) * fy
        );
      });
    }),
  );
  return result;
}
