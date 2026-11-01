// A Cesium imagery provider that draws OpenFreeMap vector tiles into transparent tiles:
// administrative boundaries, or place names. Each imagery level is drawn from the vector
// data for that zoom (dataZoomFor), so detail is added and names thin out or fill in as
// the camera moves, and text stays the same size on screen at every level — unlike a
// raster label layer, which stops at its last zoom and is then only magnified.

import { Event, WebMercatorTilingScheme, type Credit } from 'cesium';
import type { VectorTile, VectorTileFeature } from '@mapbox/vector-tile';
import { fetchVectorTile } from '../../providers/geography/openfreemapTiles';
import {
  boundaryStyle,
  dataZoomFor,
  placeLabels,
  placeStyle,
  type LabelCandidate,
  type LabelStyle,
  type LineStyle,
} from './vectorStyle';

export type VectorOverlayStyle = 'boundaries' | 'places';

/** Declared tile size; tiles are drawn at twice this so text stays sharp on screen. */
const TILE = 256;
const SCALE = 2;
const PX = TILE * SCALE;
/** Labels anchored this far outside a tile still compete, so both sides of a tile edge agree. */
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
const boundaryCache = new WeakMap<VectorTile, DecodedBoundaries>();
const placeCache = new WeakMap<VectorTile, DecodedPlaces>();

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

interface PlaceLabel extends LabelCandidate {
  style: LabelStyle;
  font: string;
  anchor: [number, number];
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
    const dz = dataZoomFor(level);
    const shift = level - dz;
    const data = await fetchVectorTile(this.providerId, dz, x >> shift, y >> shift);
    const canvas = Object.assign(document.createElement('canvas'), { width: PX, height: PX });
    if (!data) return canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    if (this.style === 'places') await document.fonts.ready;
    // Data-tile units → this tile's canvas pixels.
    const toCanvas = (extent: number) => {
      const k = (2 ** shift * PX) / extent;
      const ox = (x - ((x >> shift) << shift)) * PX;
      const oy = (y - ((y >> shift) << shift)) * PX;
      return (px: number, py: number): [number, number] => [px * k - ox, py * k - oy];
    };
    if (this.style === 'boundaries')
      this.drawBoundaries(ctx, decodeBoundaries(data), level, toCanvas);
    else this.drawPlaces(ctx, decodePlaces(data), level, toCanvas);
    return canvas;
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
    for (const c of placeLabels(candidates, LABEL_PADDING)) {
      const [l, t, r, b] = c.box;
      if (r < 0 || b < 0 || l > PX || t > PX) continue; // competed, but lies in a neighbour
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
