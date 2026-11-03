// A Cesium imagery provider that draws vector tiles into transparent tiles: water, Overture
// building footprints, roads, borders, and place names with points of interest, all into
// the same tile, in that order. One layer instead of one per overlay: they load and appear
// together, and cost one texture per tile. Each imagery level is drawn from the vector data
// for that zoom (dataZoomFor), so detail is added and names thin out or fill in as the
// camera moves, and text stays the same size on screen at every level — unlike a raster
// label layer, which stops at its last zoom and is then only magnified.

import { Event, WebMercatorTilingScheme, type Credit } from 'cesium';
import type { VectorTile, VectorTileFeature } from '@mapbox/vector-tile';
import { fetchVectorTile } from '../../providers/geography/openfreemapTiles';
import {
  fetchBuildingFootprints,
  OVERTURE_MAX_ZOOM,
} from '../../providers/geography/overtureBuildings';
import {
  aerodromeStyle,
  BUILDING_MIN_LEVEL,
  boundaryStyle,
  buildingStyle,
  dataZoomFor,
  houseNumberStyle,
  labelsForTile,
  peakStyle,
  placeStyle,
  poiStyle,
  roadLabelStyle,
  roadStyle,
  waterAreaStyle,
  waterNameStyle,
  waterwayLabelStyle,
  waterwayStyle,
  type AnchoredCandidate,
  type LabelStyle,
  type LineStyle,
  type PoiStyle,
  type RoadStyle,
} from './vectorStyle';

export type VectorOverlayStyle = 'boundaries' | 'places' | 'roads' | 'water' | 'buildings';

/** Water is drawn from this imagery level; nothing is fetched for it on coarser tiles. */
const WATER_MIN_LEVEL = 6;
/** Catalogue id named in errors from the OpenFreeMap tiles every map overlay shares. */
const OPENFREEMAP = 'openfreemap-roads';

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
/**
 * Points of interest, peaks, airports, lake names and house numbers: placed with the place
 * names, so none of them overlaps another.
 */
interface DecodedPoints {
  extent: number;
  points: {
    kind: 'poi' | 'peak' | 'aerodrome' | 'water' | 'house';
    cls: string;
    subclass: string;
    rank: number;
    name: string;
    x: number;
    y: number;
  }[];
}
interface DecodedWater {
  extent: number;
  areas: { cls: string; intermittent: boolean; rings: { x: number; y: number }[][] }[];
  ways: {
    cls: string;
    intermittent: boolean;
    tunnel: boolean;
    name: string;
    rings: { x: number; y: number }[][];
  }[];
  /** Names of seas and straits drawn along lines; point names go with the place names. */
  lineNames: { cls: string; name: string; rings: { x: number; y: number }[][] }[];
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
/** The decoded value for a tile, built once and kept as long as the tile is. */
function memo<T>(cache: WeakMap<VectorTile, T>, tile: VectorTile, build: () => T): T {
  let value = cache.get(tile);
  if (value === undefined) {
    value = build();
    cache.set(tile, value);
  }
  return value;
}

const boundaryCache = new WeakMap<VectorTile, DecodedBoundaries>();
const placeCache = new WeakMap<VectorTile, DecodedPlaces>();
const pointCache = new WeakMap<VectorTile, DecodedPoints>();
const waterCache = new WeakMap<VectorTile, DecodedWater>();
const roadCache = new WeakMap<VectorTile, DecodedRoads>();
const buildingCache = new WeakMap<VectorTile, DecodedBuildings>();

function decodeBoundaries(tile: VectorTile): DecodedBoundaries {
  return memo(boundaryCache, tile, () => {
    const layer = tile.layers['boundary'];
    const decoded: DecodedBoundaries = { extent: layer?.extent ?? 4096, lines: [] };
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i);
      if (isTrue(f.properties['maritime'])) continue; // maritime limits are not drawn
      decoded.lines.push({
        adminLevel: Number(f.properties['admin_level'] ?? 99),
        disputed: isTrue(f.properties['disputed']),
        rings: f.loadGeometry(),
      });
    }
    return decoded;
  });
}

function decodePlaces(tile: VectorTile): DecodedPlaces {
  return memo(placeCache, tile, () => {
    const layer = tile.layers['place'];
    const decoded: DecodedPlaces = { extent: layer?.extent ?? 4096, places: [] };
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
    return decoded;
  });
}

function decodePoints(tile: VectorTile): DecodedPoints {
  return memo(pointCache, tile, () => {
    const decoded: DecodedPoints = { extent: tile.layers['place']?.extent ?? 4096, points: [] };
    const read = (layerName: string, kind: DecodedPoints['points'][number]['kind']) => {
      const layer = tile.layers[layerName];
      for (let i = 0; layer && i < layer.length; i++) {
        const f = layer.feature(i);
        // Names of seas and straits can be lines; those are drawn along them with the water.
        if (f.type !== 1) continue;
        const point = f.loadGeometry()[0]?.[0];
        if (!point) continue;
        const p = f.properties;
        let name = kind === 'house' ? String(p['housenumber'] ?? '').trim() : placeName(p);
        if (kind === 'peak' && name && typeof p['ele'] === 'number')
          name = `${name} ${Math.round(p['ele']).toLocaleString('en')} m`;
        if (kind === 'aerodrome' && name && typeof p['iata'] === 'string' && p['iata'])
          name = `${name} (${p['iata']})`;
        if (!name) continue;
        // Points share the tile's coordinate space; scale if a layer's extent differs.
        const k = decoded.extent / layer.extent;
        decoded.points.push({
          kind,
          cls: String(p['class'] ?? ''),
          subclass: String(p['subclass'] ?? ''),
          rank: Number(p['rank'] ?? 999),
          name,
          x: point.x * k,
          y: point.y * k,
        });
      }
    };
    read('aerodrome_label', 'aerodrome');
    read('mountain_peak', 'peak');
    read('water_name', 'water');
    read('poi', 'poi');
    read('housenumber', 'house');
    return decoded;
  });
}

function decodeWater(tile: VectorTile): DecodedWater {
  return memo(waterCache, tile, () => {
    const water = tile.layers['water'];
    const ways = tile.layers['waterway'];
    const names = tile.layers['water_name'];
    const decoded: DecodedWater = {
      extent: water?.extent ?? ways?.extent ?? 4096,
      areas: [],
      ways: [],
      lineNames: [],
    };
    for (let i = 0; water && i < water.length; i++) {
      const f = water.feature(i);
      const cls = String(f.properties['class'] ?? '');
      if (f.type !== 3 || cls === 'ocean') continue; // the sea is left to the imagery
      decoded.areas.push({
        cls,
        intermittent: isTrue(f.properties['intermittent']),
        rings: f.loadGeometry(),
      });
    }
    for (let i = 0; ways && i < ways.length; i++) {
      const f = ways.feature(i);
      if (f.type !== 2) continue;
      decoded.ways.push({
        cls: String(f.properties['class'] ?? ''),
        intermittent: isTrue(f.properties['intermittent']),
        tunnel: f.properties['brunnel'] === 'tunnel',
        name: placeName(f.properties),
        rings: f.loadGeometry(),
      });
    }
    for (let i = 0; names && i < names.length; i++) {
      const f = names.feature(i);
      const name = placeName(f.properties);
      if (!name || f.type !== 2) continue;
      decoded.lineNames.push({
        cls: String(f.properties['class'] ?? ''),
        name,
        rings: f.loadGeometry(),
      });
    }
    return decoded;
  });
}

function decodeRoads(tile: VectorTile): DecodedRoads {
  return memo(roadCache, tile, () => {
    const layer = tile.layers['transportation'];
    const names = tile.layers['transportation_name'];
    const decoded: DecodedRoads = { extent: layer?.extent ?? 4096, lines: [], names: [] };
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
      decoded.names.push({
        cls: String(f.properties['class'] ?? ''),
        name,
        rings: f.loadGeometry(),
      });
    }
    return decoded;
  });
}

function decodeBuildings(tile: VectorTile): DecodedBuildings {
  return memo(buildingCache, tile, () => {
    const layer = tile.layers['building'];
    const decoded: DecodedBuildings = { extent: layer?.extent ?? 4096, shapes: [] };
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
    return decoded;
  });
}

type Ring = { x: number; y: number }[];
type Project = (x: number, y: number) => [number, number];

/** Add rings to the current path, in canvas pixels. */
function traceRings(
  ctx: CanvasRenderingContext2D,
  rings: Ring[],
  project: Project,
  close = false,
): void {
  for (const ring of rings) {
    ring.forEach((pt, j) => {
      const [px, py] = project(pt.x, pt.y);
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (close) ctx.closePath();
  }
}

/** Stroke lines in two passes, every casing before any line, so crossings join cleanly. */
function strokeLines(
  ctx: CanvasRenderingContext2D,
  lines: { style: LineStyle; rings: Ring[] }[],
  project: Project,
): void {
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
      traceRings(ctx, rings, project);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
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
  /** Colour of the point marker, when it differs from the text's. */
  marker?: string;
}

interface LineLabel extends AnchoredCandidate {
  font: string;
  color: string;
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

  /** What has been drawn so far, for diagnostics and the end-to-end tests. */
  readonly stats = { pois: 0, waterAreas: 0, waterways: 0 };

  constructor(
    /** What to draw, bottom to top. */
    private readonly styles: VectorOverlayStyle[],
    /** OpenFreeMap (OpenStreetMap), for everything but footprints. */
    readonly credit: Credit,
    /** Overture, credited on the tiles that draw its footprints. */
    private readonly buildingsCredit: Credit,
  ) {}

  getTileCredits(_x: number, _y: number, level: number): Credit[] | undefined {
    return this.styles.includes('buildings') && level >= BUILDING_MIN_LEVEL
      ? [this.buildingsCredit]
      : undefined;
  }

  pickFeatures(): undefined {
    return undefined;
  }

  async requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const canvas = Object.assign(document.createElement('canvas'), { width: PX, height: PX });
    const drawn = this.styles.filter(
      (style) =>
        (style !== 'buildings' || level >= BUILDING_MIN_LEVEL) &&
        (style !== 'water' || level >= WATER_MIN_LEVEL),
    );
    if (!drawn.length) return canvas;
    const mapZoom = dataZoomFor(level);
    const buildingZoom = Math.min(level, OVERTURE_MAX_ZOOM);
    const wantsMap = drawn.some((style) => style !== 'buildings');
    const [map, footprints] = await Promise.all([
      wantsMap
        ? fetchVectorTile(OPENFREEMAP, mapZoom, x >> (level - mapZoom), y >> (level - mapZoom))
        : null,
      drawn.includes('buildings')
        ? fetchBuildingFootprints(
            buildingZoom,
            x >> (level - buildingZoom),
            y >> (level - buildingZoom),
          )
        : null,
    ]);
    if (!map && !footprints) return canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    if (map && drawn.some((s) => s === 'places' || s === 'roads' || s === 'water'))
      await document.fonts.ready;
    // Data-tile units (at `dz`) → this tile's canvas pixels.
    const toCanvas = (dz: number) => (extent: number) => {
      const shift = level - dz;
      const k = (2 ** shift * PX) / extent;
      const ox = (x - ((x >> shift) << shift)) * PX;
      const oy = (y - ((y >> shift) << shift)) * PX;
      return (px: number, py: number): [number, number] => [px * k - ox, py * k - oy];
    };
    for (const style of drawn) {
      if (style === 'buildings') {
        if (footprints)
          this.drawBuildings(ctx, decodeBuildings(footprints), level, toCanvas(buildingZoom));
        continue;
      }
      if (!map) continue;
      const project = toCanvas(mapZoom);
      if (style === 'water') this.drawWater(ctx, decodeWater(map), level, project);
      else if (style === 'roads') this.drawRoads(ctx, decodeRoads(map), level, project);
      else if (style === 'boundaries')
        this.drawBoundaries(ctx, decodeBoundaries(map), level, project);
      else this.drawPlaces(ctx, decodePlaces(map), decodePoints(map), level, project);
    }
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
    strokeLines(ctx, lines, project);
    this.drawRoadNames(ctx, data, level, project);
  }

  /** Each name along the longest straight stretch of its line, where it fits. */
  private drawRoadNames(
    ctx: CanvasRenderingContext2D,
    data: DecodedRoads,
    level: number,
    project: (x: number, y: number) => [number, number],
  ): void {
    const named: { name: string; style: LabelStyle; rings: Ring[] }[] = [];
    for (const road of data.names) {
      const style = roadLabelStyle(road.cls, level);
      if (style) named.push({ name: road.name, style, rings: road.rings });
    }
    this.drawLineLabels(ctx, named, project);
  }

  private drawLineLabels(
    ctx: CanvasRenderingContext2D,
    named: { name: string; style: LabelStyle; rings: Ring[] }[],
    project: (x: number, y: number) => [number, number],
  ): void {
    const candidates: LineLabel[] = [];
    for (const { name, style, rings } of named) {
      const font = this.font(style);
      ctx.font = font;
      ctx.letterSpacing = '0px';
      const width = textWidth(ctx, name);
      const height = style.size * SCALE;
      let best: { a: [number, number]; b: [number, number]; length: number } | null = null;
      for (const ring of rings)
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
        text: name,
        font,
        color: style.color,
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
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
  }

  private drawWater(
    ctx: CanvasRenderingContext2D,
    data: DecodedWater,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    ctx.lineJoin = 'round';
    for (const area of data.areas) {
      const style = waterAreaStyle(area.cls, level, area.intermittent);
      if (!style) continue;
      ctx.beginPath();
      traceRings(ctx, area.rings, project, true);
      ctx.fillStyle = style.fill;
      ctx.fill('evenodd');
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width * SCALE;
      ctx.setLineDash(style.dash ? style.dash.map((d) => d * SCALE) : []);
      ctx.stroke();
      this.stats.waterAreas++;
    }
    ctx.setLineDash([]);
    const lines: { style: LineStyle; rings: Ring[] }[] = [];
    const named: { name: string; style: LabelStyle; rings: Ring[] }[] = [];
    for (const way of data.ways) {
      const style = waterwayStyle(way.cls, level, way.intermittent, way.tunnel);
      if (!style) continue;
      lines.push({ style, rings: way.rings });
      this.stats.waterways++;
      const label = way.name ? waterwayLabelStyle(way.cls, level) : null;
      if (label) named.push({ name: way.name, style: label, rings: way.rings });
    }
    // Wider rivers last, over the streams and drains that join them.
    lines.sort((a, b) => a.style.width - b.style.width);
    strokeLines(ctx, lines, project);
    for (const water of data.lineNames) {
      const style = waterNameStyle(water.cls, level);
      if (style) named.push({ name: water.name, style, rings: water.rings });
    }
    this.drawLineLabels(ctx, named, project);
  }

  /** A label candidate at a point, or null when it is too far outside the tile to matter. */
  private pointLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    style: LabelStyle,
    [ax, ay]: [number, number],
    marker?: string,
  ): PlaceLabel | null {
    if (ax < -MARGIN || ay < -MARGIN || ax > PX + MARGIN || ay > PX + MARGIN) return null;
    const font = this.font(style);
    ctx.font = font;
    ctx.letterSpacing = style.upper ? `${SCALE}px` : '0px';
    const width = textWidth(ctx, text);
    const height = style.size * SCALE;
    const left = style.dot ? ax - DOT_RADIUS : ax - width / 2;
    const right = style.dot ? ax + DOT_GAP + width : ax + width / 2;
    return {
      text,
      style,
      font,
      ...(marker ? { marker } : {}),
      anchor: [ax, ay],
      priority: style.priority,
      box: [left, ay - height / 2, right, ay + height / 2],
    };
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
      traceRings(ctx, shape.rings, project, true);
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
    strokeLines(ctx, lines, project);
  }

  private drawPlaces(
    ctx: CanvasRenderingContext2D,
    data: DecodedPlaces,
    points: DecodedPoints,
    level: number,
    toCanvas: (extent: number) => (x: number, y: number) => [number, number],
  ): void {
    const project = toCanvas(data.extent);
    const projectPoint = toCanvas(points.extent);
    const candidates: PlaceLabel[] = [];
    const add = (label: PlaceLabel | null) => {
      if (label) candidates.push(label);
    };
    for (const place of data.places) {
      const style = placeStyle(place.cls, place.rank, level);
      if (!style) continue;
      const text = style.upper ? place.name.toLocaleUpperCase() : place.name;
      add(this.pointLabel(ctx, text, style, project(place.x, place.y)));
    }
    for (const point of points.points) {
      const style: LabelStyle | PoiStyle | null =
        point.kind === 'poi'
          ? poiStyle(point.cls, point.subclass, point.rank, level)
          : point.kind === 'peak'
            ? peakStyle(point.rank, level)
            : point.kind === 'aerodrome'
              ? aerodromeStyle(level)
              : point.kind === 'water'
                ? waterNameStyle(point.cls, level)
                : houseNumberStyle(level);
      if (!style) continue;
      const marker = (style as Partial<PoiStyle>).marker;
      add(this.pointLabel(ctx, point.name, style, projectPoint(point.x, point.y), marker));
    }
    const kept = labelsForTile(candidates, PX, MARGIN, LABEL_PADDING);
    this.stats.pois += kept.filter((c) => c.marker).length;
    this.drawLabels(ctx, kept);
  }

  private drawLabels(ctx: CanvasRenderingContext2D, labels: PlaceLabel[]): void {
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const c of labels) {
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
        ctx.fillStyle = c.marker ?? c.style.color;
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
