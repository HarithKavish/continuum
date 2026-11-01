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

/** Width between level stops, interpolated, and doubling per level past the last stop. */
function widthAt(stops: [number, number][], level: number): number {
  const first = stops[0]!;
  if (level <= first[0]) return first[1];
  for (let i = 1; i < stops.length; i++) {
    const [l1, w1] = stops[i]!;
    const [l0, w0] = stops[i - 1]!;
    if (level <= l1) return w0 + ((w1 - w0) * (level - l0)) / (l1 - l0);
  }
  const [lastLevel, lastWidth] = stops[stops.length - 1]!;
  return lastWidth * 2 ** (level - lastLevel);
}

const ROADS: Record<
  string,
  {
    order: number;
    minLevel: number;
    color: string;
    widths: [number, number][];
    dash?: number[];
    cased?: boolean;
  }
> = {
  motorway: {
    order: 9,
    minLevel: 5,
    color: '#ffa94d',
    cased: true,
    widths: [
      [5, 0.8],
      [8, 1.4],
      [12, 3],
      [15, 6],
      [18, 16],
    ],
  },
  trunk: {
    order: 8,
    minLevel: 6,
    color: '#ffc46b',
    cased: true,
    widths: [
      [6, 0.7],
      [8, 1.2],
      [12, 2.6],
      [15, 5.5],
      [18, 15],
    ],
  },
  primary: {
    order: 7,
    minLevel: 7,
    color: '#ffe08a',
    cased: true,
    widths: [
      [7, 0.6],
      [10, 1.2],
      [12, 2.2],
      [15, 5],
      [18, 14],
    ],
  },
  secondary: {
    order: 6,
    minLevel: 9,
    color: '#fff2b3',
    cased: true,
    widths: [
      [9, 0.6],
      [12, 1.8],
      [15, 4.5],
      [18, 12],
    ],
  },
  tertiary: {
    order: 5,
    minLevel: 10,
    color: '#ffffff',
    cased: true,
    widths: [
      [10, 0.5],
      [12, 1.4],
      [15, 4],
      [18, 11],
    ],
  },
  minor: {
    order: 4,
    minLevel: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    cased: true,
    widths: [
      [12, 0.6],
      [15, 3],
      [18, 9],
    ],
  },
  busway: {
    order: 4,
    minLevel: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    cased: true,
    widths: [
      [12, 0.6],
      [15, 3],
      [18, 9],
    ],
  },
  service: {
    order: 3,
    minLevel: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    widths: [
      [14, 0.8],
      [16, 2],
      [18, 5],
    ],
  },
  track: {
    order: 2,
    minLevel: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    dash: [3, 2],
    widths: [
      [14, 0.6],
      [18, 2],
    ],
  },
  path: {
    order: 2,
    minLevel: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    dash: [2, 2],
    widths: [
      [14, 0.6],
      [18, 2],
    ],
  },
  rail: {
    order: 1,
    minLevel: 8,
    color: 'rgba(225, 225, 225, 0.9)',
    dash: [4, 3],
    widths: [
      [8, 0.5],
      [14, 1.2],
      [18, 3],
    ],
  },
  transit: {
    order: 1,
    minLevel: 10,
    color: 'rgba(225, 225, 225, 0.9)',
    dash: [3, 3],
    widths: [
      [10, 0.5],
      [14, 1.1],
      [18, 3],
    ],
  },
  ferry: {
    order: 0,
    minLevel: 8,
    color: 'rgba(140, 200, 255, 0.85)',
    dash: [4, 4],
    widths: [
      [8, 0.6],
      [18, 1.6],
    ],
  },
};

export interface RoadStyle extends LineStyle {
  /** Higher is drawn later, on top. */
  order: number;
}

/** Style for an OpenMapTiles transportation line, or null if not drawn at this level. */
export function roadStyle(roadClass: string, level: number, tunnel: boolean): RoadStyle | null {
  const road = Object.hasOwn(ROADS, roadClass) ? ROADS[roadClass] : undefined;
  if (!road || level < road.minLevel) return null;
  const width = widthAt(road.widths, level);
  return {
    order: road.order,
    width,
    // Tunnels show faintly: the road is there, but under the ground.
    color: tunnel ? 'rgba(255, 255, 255, 0.35)' : road.color,
    ...(road.dash ? { dash: road.dash } : tunnel ? { dash: [3, 3] } : {}),
    ...(road.cased && !tunnel
      ? { casing: { width: width + 1.4, color: 'rgba(0, 0, 0, 0.45)' } }
      : {}),
  };
}

/** Road names: major roads from zoom 13, the rest from 15. */
export function roadLabelStyle(roadClass: string, level: number): LabelStyle | null {
  const road = Object.hasOwn(ROADS, roadClass) ? ROADS[roadClass] : undefined;
  if (!road || road.order < 4 || level < (road.order >= 6 ? 13 : 15)) return null;
  return { priority: (10 - road.order) * 1000, size: 8.5, weight: 500, color: '#fff' };
}

/** Building footprints: drawn from this imagery level, from the zoom-14 archive. */
export const BUILDING_MIN_LEVEL = 14;

export function buildingStyle(level: number): { fill: string; stroke: string; width: number } {
  return {
    fill: 'rgba(255, 214, 170, 0.28)',
    stroke: 'rgba(255, 236, 214, 0.85)',
    width: level >= 16 ? 0.8 : 0.5,
  };
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
  // Classes come from tile data: only the table's own keys count.
  const entry = Object.hasOwn(PLACE, placeClass) ? PLACE[placeClass] : undefined;
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

export interface AnchoredCandidate extends LabelCandidate {
  anchor: [number, number];
}

/**
 * Labels to draw in a square tile of `size` pixels, from candidates in that tile's pixel
 * space. Candidates anchored up to `margin` outside the tile compete too, and only labels
 * reaching into the tile are returned, so a label crossing an edge is decided the same way
 * on both sides. That relies on each tile's data carrying its neighbours' places near the
 * edge: OpenMapTiles place tiles do, with a full tile of buffer (checked 2026-11-01: all
 * 1 108 places within half a tile of 60 shared edges, at zooms 5–14, were in both tiles).
 */
export function labelsForTile<T extends AnchoredCandidate>(
  candidates: T[],
  size: number,
  margin: number,
  padding: number,
): T[] {
  const competing = candidates.filter(
    ({ anchor: [x, y] }) =>
      x >= -margin && y >= -margin && x <= size + margin && y <= size + margin,
  );
  return placeLabels(competing, padding).filter(
    ({ box: [l, t, r, b] }) => r >= 0 && b >= 0 && l <= size && t <= size,
  );
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
