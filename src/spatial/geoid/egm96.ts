// EGM96 geoid undulation (N): the height of the EGM96 geoid above the WGS84 ellipsoid.
//
//   ellipsoidal height h = orthometric height H + N
//
// Data: NGA's EGM96 15-arc-minute grid (WW15MGH), 721 × 1440 values in centimetres,
// shipped as a static asset (public/data/egm96-15min.bin.gz, built by
// tools/build-geoid-grid.mjs) and decompressed in the browser with the native
// DecompressionStream. Interpolation is bilinear, matching egm96-universal (MIT), which
// is tested against NGA's reference implementation; tests/unit/geoid.test.ts checks
// that this module agrees with it.

const ROWS = 721;
const COLS = 1440;
const STEP = 0.25;

export type GeoidFunction = (latDeg: number, lonDeg: number) => number;

/** Build an undulation function from the delta-encoded grid (see the build script). */
export function geoidFromDeltaGrid(deltas: Int16Array): GeoidFunction {
  if (deltas.length !== ROWS * COLS) throw new Error('Unexpected EGM96 grid size');
  const grid = new Int16Array(deltas.length);
  for (let r = 0; r < ROWS; r++) {
    let value = 0;
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      value += deltas[i]!;
      grid[i] = value;
    }
  }
  return (latDeg, lonDeg) => {
    const lat = Math.max(-90, Math.min(90, latDeg));
    const lon = ((lonDeg % 360) + 360) % 360;
    let row = Math.floor((90 - lat) / STEP);
    if (row >= ROWS - 1) row = ROWS - 2;
    const col = Math.floor(lon / STEP) % COLS;
    const col2 = (col + 1) % COLS;
    const ty = (90 - lat) / STEP - row;
    const tx = lon / STEP - Math.floor(lon / STEP);
    const tl = grid[row * COLS + col]!;
    const tr = grid[row * COLS + col2]!;
    const bl = grid[(row + 1) * COLS + col]!;
    const br = grid[(row + 1) * COLS + col2]!;
    const top = tl + (tr - tl) * tx;
    const bottom = bl + (br - bl) * tx;
    return (top + (bottom - top) * ty) / 100;
  };
}

let loaded: GeoidFunction | undefined;
let loading: Promise<GeoidFunction> | undefined;
let failed = false;

export function loadGeoid(url = '/data/egm96-15min.bin.gz'): Promise<GeoidFunction> {
  loading ??= (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`EGM96 grid unavailable (HTTP ${response.status})`);
    let bytes = new Uint8Array(await response.arrayBuffer());
    // Some static servers send .gz files with Content-Encoding: gzip, in which case the
    // browser has already decompressed them; others send the raw gzip bytes.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    loaded = geoidFromDeltaGrid(
      new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2),
    );
    failed = false;
    return loaded;
  })().catch((error: unknown) => {
    failed = true;
    loading = undefined;
    throw error;
  });
  return loading;
}

export function isGeoidReady(): boolean {
  return loaded !== undefined;
}

/** 'failed' means heights are being shown without the geoid correction (N = 0). */
export function geoidStatus(): 'loading' | 'ready' | 'failed' {
  return loaded ? 'ready' : failed ? 'failed' : 'loading';
}

/** Geoid undulation N in metres. Requires loadGeoid() to have resolved. */
export function geoidUndulation(latDeg: number, lonDeg: number): number {
  if (loaded) return loaded(latDeg, lonDeg);
  if (failed) return 0;
  throw new Error('EGM96 geoid not loaded');
}

export const GEOID_MODEL = {
  name: 'EGM96',
  grid: '15 arc-minute (NGA WW15MGH), bilinear interpolation',
  reference: 'https://earth-info.nga.mil/index.php?dir=wgs84&action=wgs84',
} as const;
