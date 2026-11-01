// How the OpenMapTiles boundary and place layers are drawn at each imagery level, and how
// place labels are decluttered. Pure functions: VectorOverlayProvider does the fetching and
// the canvas work.
//
// Colours are literal, not design-system tokens: these lines and names are drawn over
// arbitrary satellite imagery in both themes (a declared exception in GOVERNANCE.md).

import { OPENFREEMAP_MAX_ZOOM } from '../../providers/geography/openfreemapTiles';

/**
 * Vector data zoom used to draw an imagery level. Zoom 2 is skipped: its tiles average
 * ~1.1 MB, against ~0.2 MB at zoom 1 and ~0.02 MB from zoom 4 (measured 2026-11-01), and
 * zoom-1 geometry is fine for whole-Earth views. Beyond OpenFreeMap's deepest zoom the
 * zoom-14 tile is drawn larger, so lines stay sharp and text keeps its size.
 */
export function dataZoomFor(level: number): number {
  if (level <= 0) return 0;
  if (level <= 3) return 1;
  return Math.min(level, OPENFREEMAP_MAX_ZOOM);
}

export interface LineStyle {
  width: number;
  color: string;
  dash?: number[];
  casing?: { width: number; color: string };
}

/**
 * OSM admin_level: 2 is a country; 3–4 a state or province; 5–6 a district or its
 * subdivision (the exact meaning varies by country). Maritime limits are not drawn.
 */
export function boundaryStyle(
  adminLevel: number,
  level: number,
  disputed: boolean,
): LineStyle | null {
  if (adminLevel <= 2)
    return {
      width: 1.6,
      color: 'rgba(255, 255, 255, 0.95)',
      casing: { width: 4, color: 'rgba(0, 0, 0, 0.45)' },
      ...(disputed ? { dash: [5, 4] } : {}),
    };
  if (adminLevel <= 4)
    return level >= 3
      ? {
          width: 1.1,
          color: 'rgba(255, 255, 255, 0.8)',
          dash: [7, 3],
          casing: { width: 3, color: 'rgba(0, 0, 0, 0.35)' },
        }
      : null;
  if (adminLevel === 5)
    return level >= 8
      ? {
          width: 1,
          color: 'rgba(255, 255, 255, 0.8)',
          dash: [4, 3],
          casing: { width: 2.5, color: 'rgba(0, 0, 0, 0.3)' },
        }
      : null;
  if (adminLevel === 6)
    return level >= 10 ? { width: 0.8, color: 'rgba(255, 255, 255, 0.6)', dash: [1.5, 3] } : null;
  return null;
}

export interface LabelStyle {
  /** Lower is placed first. */
  priority: number;
  size: number;
  weight: number;
  color: string;
  italic?: boolean;
  upper?: boolean;
  /** Text sits right of a point marker instead of centred on the anchor. */
  dot?: boolean;
}

const REGION = { size: 9, weight: 600, color: 'rgba(255, 255, 255, 0.85)', upper: true };

/**
 * Per OpenMapTiles place class: drawing order, deepest level shown, and look. Sizes are
 * tile pixels: Cesium shows a tile pixel at 1–2 screen pixels depending on distance, so
 * text appears at up to twice these sizes (measured: ~1.5× on average).
 */
const PLACE: Record<
  string,
  { order: number; maxLevel?: number; style: Omit<LabelStyle, 'priority'> }
> = {
  country: {
    order: 0,
    maxLevel: 8,
    style: { size: 10.5, weight: 700, color: '#fff', upper: true },
  },
  state: { order: 1, maxLevel: 11, style: REGION },
  province: { order: 1, maxLevel: 11, style: REGION },
  city: { order: 2, style: { size: 10, weight: 600, color: '#fff', dot: true } },
  town: { order: 3, style: { size: 9.5, weight: 500, color: '#fff', dot: true } },
  island: { order: 4, style: { size: 9, weight: 400, color: '#fff', italic: true } },
  village: { order: 5, style: { size: 9, weight: 400, color: '#fff', dot: true } },
  suburb: { order: 6, style: { size: 9, weight: 400, color: 'rgba(255, 255, 255, 0.85)' } },
  quarter: { order: 7, style: { size: 8.5, weight: 400, color: 'rgba(255, 255, 255, 0.85)' } },
  hamlet: { order: 8, style: { size: 8.5, weight: 400, color: '#fff', dot: true } },
  neighbourhood: { order: 9, style: { size: 8.5, weight: 400, color: 'rgba(255, 255, 255, 0.8)' } },
  isolated_dwelling: { order: 10, style: { size: 8.5, weight: 400, color: '#fff', dot: true } },
};

/** Style for an OpenMapTiles place feature, or null if it is not drawn at this level. */
export function placeStyle(placeClass: string, rank: number, level: number): LabelStyle | null {
  const entry = PLACE[placeClass];
  if (!entry || (entry.maxLevel !== undefined && level > entry.maxLevel)) return null;
  // Major cities (OpenMapTiles rank 1–3) a little larger, then by rank within the class.
  const size = placeClass === 'city' && rank <= 3 ? entry.style.size + 1 : entry.style.size;
  return {
    ...entry.style,
    size,
    priority: entry.order * 1000 + Math.min(Math.max(rank, 0), 999),
  };
}

export interface LabelCandidate {
  text: string;
  /** Box in imagery-level pixel space: [left, top, right, bottom]. */
  box: [number, number, number, number];
  priority: number;
}

/**
 * Greedy decluttering: candidates in priority order (ties broken by text, then position,
 * so neighbouring tiles that see the same candidates make the same choices), each kept
 * only if its padded box overlaps no box already kept.
 */
export function placeLabels<T extends LabelCandidate>(candidates: T[], padding: number): T[] {
  const ordered = [...candidates].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0) ||
      a.box[0] - b.box[0] ||
      a.box[1] - b.box[1],
  );
  const kept: T[] = [];
  for (const c of ordered) {
    const [l, t, r, b] = c.box;
    const clear = kept.every(
      (k) =>
        l - padding >= k.box[2] ||
        r + padding <= k.box[0] ||
        t - padding >= k.box[3] ||
        b + padding <= k.box[1],
    );
    if (clear) kept.push(c);
  }
  return kept;
}
