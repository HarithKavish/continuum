// Builds public/data/egm96-15min.bin.gz from egm96-universal's copy of NGA's EGM96
// 15-arc-minute geoid grid (WW15MGH): 721 rows (90°N → 90°S) × 1440 columns (0° → 359.75°E),
// Int16 centimetres, row-major, little-endian. Each row is delta-encoded (first value
// absolute, then differences), which makes the smooth field compress ~3× better.
// Usage: node tools/build-geoid-grid.mjs
import { meanSeaLevel } from 'egm96-universal';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROWS = 721;
const COLS = 1440;
const values = new Int16Array(ROWS * COLS);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const lat = 90 - r * 0.25;
    const lon = c * 0.25 > 180 ? c * 0.25 - 360 : c * 0.25;
    values[r * COLS + c] = Math.round(meanSeaLevel(lat, lon) * 100);
  }
}
const deltas = new Int16Array(values.length);
for (let r = 0; r < ROWS; r++) {
  let prev = 0;
  for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    deltas[i] = values[i] - prev;
    prev = values[i];
  }
}
const raw = Buffer.from(values.buffer);
const delta = Buffer.from(deltas.buffer);
const gz = gzipSync(delta, { level: 9 });
console.log(
  `raw ${raw.length} B, raw gz ${gzipSync(raw, { level: 9 }).length} B, delta gz ${gz.length} B`,
);
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/egm96-15min.bin.gz', gz);
