// Terrarium elevation encoding and Web Mercator tile arithmetic.
//
// Terrarium PNGs (Mapzen / Tilezen "Terrain Tiles", AWS Open Data) encode each pixel's
// height in metres as:
//
//   height = (R * 256 + G + B / 256) - 32768
//
// Heights are relative to the source datasets' own vertical references (predominantly
// mean sea level / EGM96 — see docs/ACCURACY.md), NOT the WGS84 ellipsoid.

export const TERRARIUM_TILE_SIZE = 256;
export const TERRARIUM_MAX_ZOOM = 15;

/** Web Mercator latitude limit, in degrees. Terrarium tiles do not cover beyond it. */
export const MERCATOR_MAX_LATITUDE = 85.0511287798066;

const EARTH_EQUATORIAL_CIRCUMFERENCE = 2 * Math.PI * 6378137;

export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Decodes an RGBA pixel buffer into a row-major Float32Array of heights in metres. */
export function decodeTerrarium(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = terrariumHeight(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
  }
  return out;
}

export interface TileAddress {
  z: number;
  x: number;
  y: number;
}

/** Fractional Web Mercator tile coordinates for a longitude/latitude at zoom z. */
export function lonLatToTileFraction(
  lon: number,
  lat: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Longitude of a tile's western edge (or any fractional tile x). */
export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

/** Latitude of a tile's northern edge (or any fractional tile y). */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Ground distance covered by one pixel of a 256 px Web Mercator tile at the given latitude
 * and zoom. This is the spacing of the *tile grid*, which is not the same as the native
 * resolution of the DEM that was resampled into it.
 */
export function mercatorPixelSpacingMeters(lat: number, z: number): number {
  return (
    (EARTH_EQUATORIAL_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) /
    (TERRARIUM_TILE_SIZE * 2 ** z)
  );
}

export function wrapTileX(x: number, z: number): number {
  const n = 2 ** z;
  return ((x % n) + n) % n;
}

/**
 * The tile holding a sample at fractional tile coordinates (f), among the tiles `has`
 * reports as loaded. A sample on the shared edge of two tiles can land a hair either side
 * of it in floating point; both tiles hold that edge, so whichever was loaded is used.
 * Returns the tile column and row (x unwrapped), or null if none of them is loaded.
 */
export function tileForSample(
  f: { x: number; y: number },
  z: number,
  has: (x: number, y: number) => boolean,
  epsilon = 1e-6,
): { tx: number; ty: number } | null {
  const max = 2 ** z - 1;
  const xs = [Math.floor(f.x)];
  if (f.x - xs[0]! < epsilon) xs.push(xs[0]! - 1);
  if (xs[0]! + 1 - f.x < epsilon) xs.push(xs[0]! + 1);
  const y0 = Math.min(max, Math.floor(f.y));
  const ys = [y0];
  if (f.y - y0 < epsilon && y0 > 0) ys.push(y0 - 1);
  if (y0 + 1 - f.y < epsilon && y0 < max) ys.push(y0 + 1);
  for (const ty of ys) for (const tx of xs) if (has(wrapTileX(tx, z), ty)) return { tx, ty };
  return null;
}

/**
 * Bilinear sample of a decoded tile at fractional pixel coordinates. Pixel centres sit at
 * integer + 0.5; coordinates are clamped to the tile, so callers handle cross-tile seams.
 */
export function sampleBilinear(
  heights: ArrayLike<number>,
  size: number,
  px: number,
  py: number,
): number {
  const fx = Math.max(0, Math.min(size - 1, px - 0.5));
  const fy = Math.max(0, Math.min(size - 1, py - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const h00 = heights[y0 * size + x0]!;
  const h10 = heights[y0 * size + x1]!;
  const h01 = heights[y1 * size + x0]!;
  const h11 = heights[y1 * size + x1]!;
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
}

/** The lowest sample within `radius` pixels of the one containing (px, py). */
function windowMin(
  heights: Float32Array,
  size: number,
  px: number,
  py: number,
  radius: number,
): number {
  const cx = Math.max(0, Math.min(size - 1, Math.floor(px)));
  const cy = Math.max(0, Math.min(size - 1, Math.floor(py)));
  let lowest = Infinity;
  for (let y = Math.max(0, cy - radius); y <= Math.min(size - 1, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(size - 1, cx + radius); x++)
      lowest = Math.min(lowest, heights[y * size + x]!);
  return lowest;
}

/**
 * Horn (1981) slope from a 3x3 neighbourhood of heights (row-major, metres) with the
 * given grid spacing in metres. Returns slope in degrees and aspect in degrees clockwise
 * from north (the downslope direction), or null aspect on flat ground.
 */
export function hornSlope(
  window: ArrayLike<number>,
  spacingX: number,
  spacingY: number,
): { slopeDeg: number; aspectDeg: number | null } {
  const [a, b, c, d, , f, g, h, i] = Array.from(window) as number[];
  const dzdx = (c! + 2 * f! + i! - (a! + 2 * d! + g!)) / (8 * spacingX);
  const dzdy = (g! + 2 * h! + i! - (a! + 2 * b! + c!)) / (8 * spacingY);
  const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
  if (dzdx === 0 && dzdy === 0) return { slopeDeg, aspectDeg: null };
  // Rows run north to south, so +dzdy means height increases southward; the downslope
  // direction is opposite the gradient.
  const aspect = (Math.atan2(-dzdx, dzdy) * 180) / Math.PI;
  return { slopeDeg, aspectDeg: (aspect + 360) % 360 };
}

// ---------------------------------------------------------------------------------------
// Source corrections.
//
// Each was found by sampling the live tiles (see docs/RESEARCH.md § Terrain findings) and
// each uses only real data from the same product: nothing is synthesised. Replaced or
// converted pixels are marked in a per-tile mask so the inspector can say what happened.

export const CORRECTION = {
  /** Sea-level fill replaced by ETOPO1 bathymetry from a coarser tile. */
  bathymetry: 1,
  /** ETOPO1 bedrock under an ice sheet replaced by the GMTED2010 ice surface from a coarser tile. */
  iceSurface: 2,
  /** ArcticDEM height converted from WGS84 ellipsoidal to EGM96 orthometric. */
  arcticDem: 4,
} as const;

/** Zoom at and above which sea-level fill can replace ETOPO1 bathymetry. */
export const SEA_LEVEL_FILL_MIN_ZOOM = 11;

/** Zoom of the ancestor tiles whose GMTED2010 values give the ice-sheet surface. */
export const ICE_SURFACE_ZOOM = 3;

/** Bedrock is only replaced where the ancestor surface is at least this much higher. */
export const ICE_SURFACE_MIN_EXCESS = 50;

/**
 * Ancestor pixels on each side that must all pass that test. A narrower window raised
 * 8 000–11 600 pixels per tile of ice-free west Greenland; this one raises 0–61 and still
 * restores the interior and the ice shelves (measured on live z6/z8 tiles).
 */
export const ICE_SURFACE_WINDOW = 3;

/**
 * Where ETOPO1 Bedrock differs from the surface: the Antarctic and Greenland ice sheets.
 * Elsewhere ETOPO1 carries the surface, ice caps included (verified: Vatnajökull reads
 * 1 590 m at z3–6). Antarctica is everything south of 60°S. Greenland is bounded on the
 * west by the straits that separate it from Canada and excludes Iceland, so Baffin Island,
 * Ellesmere Island and Iceland stay outside.
 */
export function inIceSheetRegion(lat: number, lon: number): boolean {
  if (lat < -60) return true;
  if (lat < 59 || lat > 84 || lon > -10) return false;
  if (lat < 67 && lon > -30) return false; // Iceland and the Denmark Strait
  return lon > greenlandWesternEdge(lat);
}

/** Longitude of the line down Davis Strait, Baffin Bay and Nares Strait. */
function greenlandWesternEdge(lat: number): number {
  if (lat < 74.5) return -60; // east of Baffin Island's Cape Dyer (61.3°W)
  if (lat < 78.5) return -74; // west of Greenland's Cape Alexander (73.1°W)
  // Nares Strait runs north-east past Hans Island (80.8°N 66.5°W), then Robeson Channel
  // bends east to the Lincoln Sea. Every point on this line is water in the tiles.
  if (lat < 81.8) return -74 + (lat - 78.5) * 3.33;
  return Math.min(-59, -63 + (lat - 81.8) * 6.67);
}

/** Coarse pre-filter: whether a tile's bounds can contain part of inIceSheetRegion(). */
export function tileTouchesIceSheet(bounds: [number, number, number, number]): boolean {
  const [w, s, e, n] = bounds;
  return s < -60 || (n > 59 && s < 84 && e > -75 && w < -10);
}

function forEachPixel(visit: (index: number, px: number, py: number) => void): void {
  const size = TERRARIUM_TILE_SIZE;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) visit(py * size + px, px, py);
}

function ancestorSample(
  child: TileAddress,
  px: number,
  py: number,
  ancestor: Float32Array,
  ancestorAddress: TileAddress,
  sample: (heights: Float32Array, size: number, px: number, py: number) => number = sampleBilinear,
): number {
  const size = TERRARIUM_TILE_SIZE;
  const scale = 2 ** (child.z - ancestorAddress.z);
  const ax = (child.x * size + px + 0.5) / scale - ancestorAddress.x * size;
  const ay = (child.y * size + py + 0.5) / scale - ancestorAddress.y * size;
  return sample(ancestor, size, ax, ay);
}

/**
 * Bathymetry fallback for sea-level fill.
 *
 * In parts of the open ocean the Terrain Tiles at zoom ≥ 11 are built only from GMTED or
 * SRTM, which fill water with 0 m, so the seafloor that ETOPO1 supplies at zoom ≤ 10
 * vanishes (verified: Challenger Deep reads −10 434 m at z10 and 0 m at z11–15). For each
 * pixel that is exactly 0 m, take the value interpolated from an ancestor tile that does
 * contain ETOPO1, if that value is below sea level.
 *
 * Mutates `child` and sets CORRECTION.bathymetry in `mask`. Returns the count replaced.
 */
export function fillSeaLevelFromAncestor(
  child: Float32Array,
  childAddress: TileAddress,
  ancestor: Float32Array,
  ancestorAddress: TileAddress,
  mask: Uint8Array,
): number {
  if (childAddress.z <= ancestorAddress.z) throw new RangeError('Ancestor must be at a lower zoom');
  let count = 0;
  forEachPixel((i, px, py) => {
    if (child[i] !== 0) return;
    const value = ancestorSample(childAddress, px, py, ancestor, ancestorAddress);
    if (value < 0) {
      child[i] = value;
      mask[i] = (mask[i] ?? 0) | CORRECTION.bathymetry;
      count++;
    }
  });
  return count;
}

/**
 * Ice-surface fallback for ETOPO1 bedrock.
 *
 * The Terrain Tiles use ETOPO1 *Bedrock* (ETOPO1_Bed_g), so at the zooms where ETOPO1 is
 * the only source over Antarctica and Greenland the ice sheets disappear (verified: Vostok
 * reads 3 498 m at z3, −87 to −95 m at z5–10, 3 500 m at z12). Inside the ice-sheet
 * regions, a pixel takes the ancestor's GMTED2010 surface only when every ancestor sample
 * within ICE_SURFACE_WINDOW pixels is above sea level and the pixel lies more than
 * ICE_SURFACE_MIN_EXCESS below the lowest of them. Seafloor, coasts, fjords, valleys and
 * ice-free land keep their own values; so does ice within that window of the ice edge,
 * which stays at ETOPO1 bedrock. Callers apply it only to tiles whose sole source is ETOPO1.
 */
export function fillIceSurfaceFromAncestor(
  child: Float32Array,
  childAddress: TileAddress,
  ancestor: Float32Array,
  ancestorAddress: TileAddress,
  mask: Uint8Array,
): number {
  if (childAddress.z <= ancestorAddress.z) throw new RangeError('Ancestor must be at a lower zoom');
  const size = TERRARIUM_TILE_SIZE;
  let count = 0;
  forEachPixel((i, px, py) => {
    const lat = tileYToLat(childAddress.y + (py + 0.5) / size, childAddress.z);
    const lon = tileXToLon(childAddress.x + (px + 0.5) / size, childAddress.z);
    if (!inIceSheetRegion(lat, lon)) return;
    const lowest = ancestorSample(childAddress, px, py, ancestor, ancestorAddress, (h, s, x, y) =>
      windowMin(h, s, x, y, ICE_SURFACE_WINDOW),
    );
    if (lowest > 0 && lowest - child[i]! > ICE_SURFACE_MIN_EXCESS) {
      child[i] = ancestorSample(childAddress, px, py, ancestor, ancestorAddress);
      mask[i] = (mask[i] ?? 0) | CORRECTION.iceSurface;
      count++;
    }
  });
  return count;
}

/**
 * ArcticDEM heights in the Terrain Tiles are WGS84 ellipsoidal (verified against the
 * Copernicus DEM: Reykjavík +66.4 m vs N = 66.4 m; Greenland Summit +47.9 m vs N = 43.9 m),
 * while every other source is orthometric. Convert land pixels (h > 0) of tiles that
 * contain ArcticDEM: H = h − N. Pixels of other sources mixed into the same tile cannot be
 * told apart and are converted too — a known, flagged limitation.
 */
export function convertEllipsoidalToOrthometric(
  heights: Float32Array,
  address: TileAddress,
  undulation: (lat: number, lon: number) => number,
  mask: Uint8Array,
): number {
  const size = TERRARIUM_TILE_SIZE;
  let count = 0;
  // N varies over tens of kilometres; evaluate it on a coarse grid and interpolate.
  const step = 16;
  const grid = size / step + 1;
  const n = new Float32Array(grid * grid);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const lat = tileYToLat(address.y + (gy * step) / size, address.z);
      const lon = tileXToLon(address.x + (gx * step) / size, address.z);
      n[gy * grid + gx] = undulation(lat, lon);
    }
  }
  forEachPixel((i, px, py) => {
    if (!(heights[i]! > 0)) return;
    const fx = (px + 0.5) / step;
    const fy = (py + 0.5) / step;
    const x0 = Math.min(grid - 2, Math.floor(fx));
    const y0 = Math.min(grid - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const nAt =
      (n[y0 * grid + x0]! * (1 - tx) + n[y0 * grid + x0 + 1]! * tx) * (1 - ty) +
      (n[(y0 + 1) * grid + x0]! * (1 - tx) + n[(y0 + 1) * grid + x0 + 1]! * tx) * ty;
    heights[i] = heights[i]! - nAt;
    mask[i] = (mask[i] ?? 0) | CORRECTION.arcticDem;
    count++;
  });
  return count;
}
