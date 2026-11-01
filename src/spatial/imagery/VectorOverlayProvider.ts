// A Cesium imagery provider that draws vector tiles into transparent tiles: borders, place
// names and roads from OpenFreeMap, or building footprints from Overture. Each imagery
// level is drawn from the vector
// data for that zoom (dataZoomFor), so detail is added and names thin out or fill in as
// the camera moves, and text stays the same size on screen at every level — unlike a
// raster label layer, which stops at its last zoom and is then only magnified.

import { Event, WebMercatorTilingScheme, type Credit } from 'cesium';
import type { VectorTile, VectorTileFeature } from '@mapbox/vector-tile';
import { fetchVectorTile } from '../../providers/geography/openfreemapTiles';
import {
  fetchBuildingFootprints,
  OVERTURE_MAX_ZOOM,
} from '../../providers/geography/overtureBuildings';
import {
  BUILDING_MIN_LEVEL,
  boundaryStyle,
  buildingStyle,
  dataZoomFor,
  labelsForTile,
  placeStyle,
  roadLabelStyle,
  roadStyle,
  type AnchoredCandidate,
  type LabelStyle,
  type LineStyle,
  type RoadStyle,
} from './vectorStyle';

export type VectorOverlayStyle = 'boundaries' | 'places' | 'roads' | 'buildings';

/** Declared tile size; tiles are drawn at twice this so text stays sharp on screen. */
const TILE = 256;
const SCALE = 2;
const PX = TILE * SCALE;
/**
 * Labels anchored this far outside a tile still compete, so both sides of a tile edge agree
 * (labelsForTile). Within the tile data's own buffer, which for places is a full tile.
 */
const MARGIN = PX / 2;
const LABEL_PADDING = 4 * SCALE;
const DOT_RADIUS = 1.8 * SCALE;
/** From a point marker to the start of its name. */
const DOT_GAP = 5 * SCALE;

let fontFamily: string | undefined;
function family(): string {
  fontFamily ??= getComputedStyle(document.body).fontFamily || 'sans-serif';
  return fontFamily;
}

function placeName(props: VectorTileFeature['properties']): string {
  const name = props['name:en'] ?? props['name_en'] ?? props['name:latin'] ?? props['name'];
  return typeof name === 'string' ? name.trim() : '';
}

const isTrue = (v: unknown) => v === 1 || v === true;

// A data tile is drawn into many imagery tiles (both overlays, and every overzoomed child),
// so each layer is decoded once per tile and kept with it.
interface DecodedBoundaries {
  extent: number;
  lines: { adminLevel: number; disputed: boolean; rings: { x: number; y: number }[][] }[];
}
interface DecodedPlaces {
  extent: number;
  places: { cls: string; rank: number; name: string; x: number; y: number }[];
}
interface DecodedRoads {
  extent: number;
  lines: { cls: string; tunnel: boolean; rings: { x: number; y: number }[][] }[];
  names: { cls: string; name: string; rings: { x: number; y: number }[][] }[];
}
interface DecodedBuildings {
  extent: number;
  /** Outer and inner rings, with each footprint's bounding box for culling. */
  shapes: { rings: { x: number; y: number }[][]; box: [number, number, number, number] }[];
}
const boundaryCache = new WeakMap<VectorTile, DecodedBoundaries>();
const placeCache = new WeakMap<VectorTile, DecodedPlaces>();
const roadCache = new WeakMap<VectorTile, DecodedRoads>();
const buildingCache = new WeakMap<VectorTile, DecodedBuildings>();

function decodeBoundaries(tile: VectorTile): DecodedBoundaries {
  let decoded = boundaryCache.get(tile);
  if (decoded) return decoded;
  const layer = tile.layers['boundary'];
  decoded = { extent: layer?.extent ?? 4096, lines: [] };
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (isTrue(f.properties['maritime'])) continue; // maritime limits are not drawn
    decoded.lines.push({
      adminLevel: Number(f.properties['admin_level'] ?? 99),
      disputed: isTrue(f.properties['disputed']),
      rings: f.loadGeometry(),
    });
  }
  boundaryCache.set(tile, decoded);
  return decoded;
}

function decodePlaces(tile: VectorTile): DecodedPlaces {
  let decoded = placeCache.get(tile);
  if (decoded) return decoded;
  const layer = tile.layers['place'];
  decoded = { extent: layer?.extent ?? 4096, places: [] };
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    const name = placeName(f.properties);
    const point = f.loadGeometry()[0]?.[0];
    if (!name || !point) continue;
    decoded.places.push({
      cls: String(f.properties['class'] ?? ''),
      rank: Number(f.properties['rank'] ?? 999),
      name,
      x: point.x,
      y: point.y,
    });
  }
  placeCache.set(tile, decoded);
  return decoded;
}

function decodeRoads(tile: VectorTile): DecodedRoads {
  let decoded = roadCache.get(tile);
  if (decoded) return decoded;
  const layer = tile.layers['transportation'];
  const names = tile.layers['transportation_name'];
  decoded = { extent: layer?.extent ?? 4096, lines: [], names: [] };
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2) continue; // lines only; piers and bridges also come as areas
    decoded.lines.push({
      cls: String(f.properties['class'] ?? ''),
      tunnel: f.properties['brunnel'] === 'tunnel',
      rings: f.loadGeometry(),
    });
  }
  for (let i = 0; names && i < names.length; i++) {
    const f = names.feature(i);
    const name = placeName(f.properties) || String(f.properties['ref'] ?? '').trim();
    if (f.type !== 2 || !name) continue;
    decoded.names.push({ cls: String(f.properties['class'] ?? ''), name, rings: f.loadGeometry() });
  }
  roadCache.set(tile, decoded);
  return decoded;
}

function decodeBuildings(tile: VectorTile): DecodedBuildings {
  let decoded = buildingCache.get(tile);
  if (decoded) return decoded;
  const layer = tile.layers['building'];
  decoded = { extent: layer?.extent ?? 4096, shapes: [] };
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3 || isTrue(f.properties['is_underground'])) continue;
    const rings = f.loadGeometry();
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings)
      for (const p of ring) {
        box[0] = Math.min(box[0], p.x);
        box[1] = Math.min(box[1], p.y);
        box[2] = Math.max(box[2], p.x);
        box[3] = Math.max(box[3], p.y);
      }
    decoded.shapes.push({ rings, box });
  }
  buildingCache.set(tile, decoded);
  return decoded;
}

const widths = new Map<string, number>();
/** Width of `text` in the context's current font and letter spacing, measured once. */
function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}|${ctx.letterSpacing}|${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    width = ctx.measureText(text).width;
    if (widths.size > 20_000) widths.clear();
    widths.set(key, width);
  }
  return width;
}

interface PlaceLabel extends AnchoredCandidate {
  style: LabelStyle;
  font: string;
}

interface RoadLabel extends AnchoredCandidate {
  font: string;
  /** Radians, kept between -90 and 90 degrees so names never read upside down. */
  angle: number;
}

export class VectorOverlayProvider {
  readonly tilingScheme = new WebMercatorTilingScheme();
  readonly rectangle = this.tilingScheme.rectangle;
  readonly tileWidth = TILE;
  readonly tileHeight = TILE;
  readonly minimumLevel = 0;
  readonly maximumLevel = 19;
  readonly tileDiscardPolicy = undefined;
  readonly errorEvent = new Event();
  readonly hasAlphaChannel = true;
  readonly proxy = undefined;

  constructor(
    private readonly providerId: string,
    private readonly style: VectorOverlayStyle,
    readonly credit: Credit,
  ) {}

  getTileCredits(): undefined {
    return undefined;
  }

  pickFeatures(): undefined {
    return undefined;
  }

  async requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const canvas = Object.assign(document.createElement('canvas'), { width: PX, height: PX });
    const buildings = this.style === 'buildings';
    if (buildings && level < BUILDING_MIN_LEVEL) return canvas;
    const dz = buildings ? Math.min(level, OVERTURE_MAX_ZOOM) : dataZoomFor(level);
    const shift = level - dz;
    const data = buildings
      ? await fetchBuildingFootprints(dz, x >> shift, y >> shift)
      : await fetchVectorTile(this.providerId, dz, x >> shift, y >> shift);
    if (!data) return canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    if (this.style === 'places' || this.style === 'roads') await document.fonts.ready;
    // Data-tile units → this tile's canvas pixels.
    const toCanvas = (extent: number) => {
      const k = (2 ** shift * PX) / extent;
      const ox = (x - ((x >> shift) << shift)) * PX;
      const oy = (y - ((y >> shift) << shift)) * PX;
      return (px: number, py: number): [number, number] => [px * k - ox, py * k - oy];
    };
    if (this.style === 'boundaries')
      this.drawBoundaries(ctx, decodeBoundaries(data), level, toCanvas);
    else if (this.style === 'places') this.drawPlaces(ctx, decodePlaces(data), level, toCanvas);
    else if (this.style === 'roads') this.drawRoads(ctx, decodeRoads(data), level, toCanvas);
    else this.drawBuildings(ctx, decodeBuildings(data), level, toCanvas);
    return canvas;
  }

  private drawRoads(
    ctx: CanvasRenderingContext2D,
    data: DecodedRoads,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    const lines: { style: RoadStyle; rings: { x: number; y: number }[][] }[] = [];
    for (const line of data.lines) {
      const style = roadStyle(line.cls, level, line.tunnel);
      if (style) lines.push({ style, rings: line.rings });
    }
    // Minor roads first; every casing before any fill, so junctions join cleanly.
    lines.sort((a, b) => a.style.order - b.style.order);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pass of ['casing', 'line'] as const) {
      for (const { style, rings } of lines) {
        const stroke = pass === 'casing' ? style.casing : style;
        if (!stroke) continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * SCALE;
        ctx.setLineDash(pass === 'line' && style.dash ? style.dash.map((d) => d * SCALE) : []);
        ctx.beginPath();
        for (const ring of rings) {
          ring.forEach((pt, j) => {
            const [px, py] = project(pt.x, pt.y);
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    this.drawRoadNames(ctx, data, level, project);
  }

  /** Each name along the longest straight stretch of its road, where it fits. */
  private drawRoadNames(
    ctx: CanvasRenderingContext2D,
    data: DecodedRoads,
    level: number,
    project: (x: number, y: number) => [number, number],
  ): void {
    const candidates: RoadLabel[] = [];
    for (const road of data.names) {
      const style = roadLabelStyle(road.cls, level);
      if (!style) continue;
      const font = this.font(style);
      ctx.font = font;
      ctx.letterSpacing = '0px';
      const width = textWidth(ctx, road.name);
      const height = style.size * SCALE;
      let best: { a: [number, number]; b: [number, number]; length: number } | null = null;
      for (const ring of road.rings)
        for (let j = 1; j < ring.length; j++) {
          const a = project(ring[j - 1]!.x, ring[j - 1]!.y);
          const b = project(ring[j]!.x, ring[j]!.y);
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (!best || length > best.length) best = { a, b, length };
        }
      if (!best || best.length < width + 8 * SCALE) continue;
      const mx = (best.a[0] + best.b[0]) / 2;
      const my = (best.a[1] + best.b[1]) / 2;
      let angle = Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      // Axis-aligned box around the rotated text, for decluttering.
      const hw = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) / 2;
      const hh = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) / 2;
      candidates.push({
        text: road.name,
        font,
        angle,
        anchor: [mx, my],
        priority: style.priority,
        box: [mx - hw, my - hh, mx + hw, my + hh],
      });
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const c of labelsForTile(candidates, PX, MARGIN, LABEL_PADDING)) {
      ctx.save();
      ctx.translate(c.anchor[0], c.anchor[1]);
      ctx.rotate(c.angle);
      ctx.font = c.font;
      ctx.letterSpacing = '0px';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
  }

  private drawBuildings(
    ctx: CanvasRenderingContext2D,
    data: DecodedBuildings,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    const style = buildingStyle(level);
    // One path for every footprint in view: a single fill and stroke.
    ctx.beginPath();
    for (const shape of data.shapes) {
      const [l, t] = project(shape.box[0], shape.box[1]);
      const [r, b] = project(shape.box[2], shape.box[3]);
      if (r < 0 || b < 0 || l > PX || t > PX) continue;
      for (const ring of shape.rings) {
        ring.forEach((pt, j) => {
          const [px, py] = project(pt.x, pt.y);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
    }
    ctx.fillStyle = style.fill;
    ctx.fill('evenodd');
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.width * SCALE;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  private drawBoundaries(
    ctx: CanvasRenderingContext2D,
    data: DecodedBoundaries,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    const lines: { style: LineStyle; rings: { x: number; y: number }[][] }[] = [];
    for (const line of data.lines) {
      const style = boundaryStyle(line.adminLevel, level, line.disputed);
      if (style) lines.push({ style, rings: line.rings });
    }
    // Widest (country) lines last, so they sit on top of state and district lines.
    lines.sort((a, b) => a.style.width - b.style.width);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pass of ['casing', 'line'] as const) {
      for (const { style, rings } of lines) {
        const stroke = pass === 'casing' ? style.casing : style;
        if (!stroke) continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width * SCALE;
        ctx.setLineDash(pass === 'line' && style.dash ? style.dash.map((d) => d * SCALE) : []);
        ctx.beginPath();
        for (const ring of rings) {
          ring.forEach((pt, j) => {
            const [px, py] = project(pt.x, pt.y);
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
        }
        ctx.stroke();
      }
    }
  }

  private drawPlaces(
    ctx: CanvasRenderingContext2D,
    data: DecodedPlaces,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    const candidates: PlaceLabel[] = [];
    for (const place of data.places) {
      const style = placeStyle(place.cls, place.rank, level);
      if (!style) continue;
      const [ax, ay] = project(place.x, place.y);
      if (ax < -MARGIN || ay < -MARGIN || ax > PX + MARGIN || ay > PX + MARGIN) continue;
      const text = style.upper ? place.name.toLocaleUpperCase() : place.name;
      const font = this.font(style);
      ctx.font = font;
      ctx.letterSpacing = style.upper ? `${SCALE}px` : '0px';
      const width = textWidth(ctx, text);
      const height = style.size * SCALE;
      const left = style.dot ? ax - DOT_RADIUS : ax - width / 2;
      const right = style.dot ? ax + DOT_GAP + width : ax + width / 2;
      candidates.push({
        text,
        style,
        font,
        anchor: [ax, ay],
        priority: style.priority,
        box: [left, ay - height / 2, right, ay + height / 2],
      });
    }
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const c of labelsForTile(candidates, PX, MARGIN, LABEL_PADDING)) {
      const [ax, ay] = c.anchor;
      ctx.font = c.font;
      ctx.letterSpacing = c.style.upper ? `${SCALE}px` : '0px';
      ctx.textAlign = c.style.dot ? 'left' : 'center';
      const tx = c.style.dot ? ax + DOT_GAP : ax;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.strokeText(c.text, tx, ay);
      ctx.fillStyle = c.style.color;
      ctx.fillText(c.text, tx, ay);
      if (c.style.dot) {
        ctx.beginPath();
        ctx.arc(ax, ay, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = SCALE;
        ctx.stroke();
      }
    }
  }

  private font(style: LabelStyle): string {
    return `${style.italic ? 'italic ' : ''}${style.weight} ${style.size * SCALE}px ${family()}`;
  }
}
