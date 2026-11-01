// Fetches and decodes Terrarium elevation tiles, applies the documented source
// corrections, and holds a bounded in-memory LRU of decoded tiles. Nothing is persisted:
// the browser's HTTP cache (driven by the provider's own headers) is the only cache that
// outlives the page.
//
// After decoding, every height in a tile is orthometric (≈ above mean sea level). Callers
// add the geoid undulation themselves when they need ellipsoidal heights.

import { RequestQueue } from '../../core/net/RequestQueue';
import { geoidUndulation, loadGeoid } from '../geoid/egm96';
import {
  convertEllipsoidalToOrthometric,
  CORRECTION,
  decodeTerrarium,
  fillIceSurfaceFromAncestor,
  fillSeaLevelFromAncestor,
  ICE_SURFACE_ZOOM,
  lonLatToTileFraction,
  MERCATOR_MAX_LATITUDE,
  sampleBilinear,
  SEA_LEVEL_FILL_MIN_ZOOM,
  TERRARIUM_MAX_ZOOM,
  TERRARIUM_TILE_SIZE,
  tileTouchesIceSheet,
  tileXToLon,
  tileYToLat,
  wrapTileX,
  type TileAddress,
} from './terrarium';

export interface TileCorrections {
  /** Bit flags per pixel (see CORRECTION). */
  mask: Uint8Array;
  bathymetry: { fromZoom: number; sources: string[]; pixels: number } | null;
  iceSurface: { fromZoom: number; sources: string[]; pixels: number } | null;
  arcticDem: { pixels: number } | null;
}

export interface DecodedTerrainTile extends TileAddress {
  /** Orthometric heights, metres, row-major from the north-west corner. */
  heights: Float32Array;
  /** Source DEM files reported by the provider for this tile (x-amz-meta-x-imagery-sources). */
  sources: string[];
  lastModified: string | null;
  retrievedAt: string;
  minHeight: number;
  maxHeight: number;
  /** Western, southern, eastern, northern bounds in degrees. */
  bounds: [number, number, number, number];
  corrections: TileCorrections | null;
}

export interface TerrainTileSourceStats {
  cachedTiles: number;
  fetched: number;
  failed: number;
  missing: number;
  corrected: number;
}

export interface TerrariumTileSourceOptions {
  urlTemplate: string;
  maxZoom?: number;
  maxConcurrent?: number;
  /** Upper bound on decoded tiles held in memory (each is 256 KiB). */
  maxCachedTiles?: number;
}

export class TileNotAvailableError extends Error {
  constructor(address: TileAddress, status: number) {
    super(`Terrain tile ${address.z}/${address.x}/${address.y} unavailable (HTTP ${status})`);
    this.name = 'TileNotAvailableError';
  }
}

export interface HeightSample {
  height: number;
  tile: DecodedTerrainTile;
  zoom: number;
  /** CORRECTION flags of the nearest pixel. */
  corrections: number;
}

// Point inspections and profiles outrank streaming: the user is waiting on them. Jobs at
// this priority are also never pruned for being out of view.
export const INSPECTION_PRIORITY = 100;

const tileKey = (t: TileAddress) => `${t.z}/${t.x}/${t.y}`;
const hasSource = (tile: DecodedTerrainTile, prefix: string) =>
  tile.sources.some((s) => s.startsWith(prefix));
const onlySource = (tile: DecodedTerrainTile, prefix: string) =>
  tile.sources.length > 0 && tile.sources.every((s) => s.startsWith(prefix));

export class TerrariumTileSource {
  readonly maxZoom: number;
  readonly queue: RequestQueue;
  private readonly cache = new Map<string, DecodedTerrainTile>();
  private readonly ancestorRequests = new Map<string, Promise<DecodedTerrainTile>>();
  private readonly maxCachedTiles: number;
  private readonly urlTemplate: string;
  readonly stats: TerrainTileSourceStats = {
    cachedTiles: 0,
    fetched: 0,
    failed: 0,
    missing: 0,
    corrected: 0,
  };

  constructor(options: TerrariumTileSourceOptions) {
    this.urlTemplate = options.urlTemplate;
    this.maxZoom = options.maxZoom ?? TERRARIUM_MAX_ZOOM;
    this.maxCachedTiles = options.maxCachedTiles ?? 160;
    this.queue = new RequestQueue('terrain', options.maxConcurrent ?? 6);
  }

  url(t: TileAddress): string {
    return this.urlTemplate
      .replace('{z}', String(t.z))
      .replace('{x}', String(t.x))
      .replace('{y}', String(t.y));
  }

  peek(t: TileAddress): DecodedTerrainTile | undefined {
    const key = tileKey(t);
    const tile = this.cache.get(key);
    if (tile) {
      // Refresh recency.
      this.cache.delete(key);
      this.cache.set(key, tile);
    }
    return tile;
  }

  /**
   * Get a decoded tile, from memory or the network. The queued job is tagged with the
   * tile's bounds (W, S, E, N degrees) so the owner can abort jobs for tiles the camera
   * no longer covers.
   */
  load(t: TileAddress, priority = 0): Promise<DecodedTerrainTile> {
    const cached = this.peek(t);
    if (cached) return Promise.resolve(cached);
    const bounds = [
      tileXToLon(t.x, t.z),
      tileYToLat(t.y + 1, t.z),
      tileXToLon(t.x + 1, t.z),
      tileYToLat(t.y, t.z),
    ];
    return this.queue.enqueue(tileKey(t), (signal) => this.fetchTile(t, signal), priority, bounds);
  }

  private async fetchTile(t: TileAddress, signal: AbortSignal): Promise<DecodedTerrainTile> {
    const tile = await this.download(t, signal);
    await this.correct(tile);
    this.store(tile);
    return tile;
  }

  /** Apply the source corrections documented in terrarium.ts. */
  private async correct(tile: DecodedTerrainTile): Promise<void> {
    const size = TERRARIUM_TILE_SIZE * TERRARIUM_TILE_SIZE;
    let corrections: TileCorrections | null = null;
    const ensure = (): TileCorrections =>
      (corrections ??= {
        mask: new Uint8Array(size),
        bathymetry: null,
        iceSurface: null,
        arcticDem: null,
      });

    if (
      hasSource(tile, 'pgdc_5m/') &&
      tile.maxHeight > 0 &&
      (await loadGeoid().then(
        () => true,
        () => false,
      ))
    ) {
      const c = ensure();
      const pixels = convertEllipsoidalToOrthometric(tile.heights, tile, geoidUndulation, c.mask);
      if (pixels) c.arcticDem = { pixels };
    }

    // Only ETOPO1-only tiles: in mixed tiles the land comes from GMTED2010 or a finer DEM,
    // which already carries the surface (verified: Greenland Summit reads 3 207 m in the
    // mixed z4 tile).
    if (
      tile.z > ICE_SURFACE_ZOOM &&
      onlySource(tile, 'etopo1/') &&
      tileTouchesIceSheet(tile.bounds)
    ) {
      const shift = tile.z - ICE_SURFACE_ZOOM;
      const ancestor = await this.loadAncestor({
        z: ICE_SURFACE_ZOOM,
        x: tile.x >> shift,
        y: tile.y >> shift,
      }).catch(() => null);
      if (ancestor) {
        const c = ensure();
        const pixels = fillIceSurfaceFromAncestor(
          tile.heights,
          tile,
          ancestor.heights,
          ancestor,
          c.mask,
        );
        if (pixels)
          c.iceSurface = { fromZoom: ICE_SURFACE_ZOOM, sources: ancestor.sources, pixels };
      }
    }

    if (
      tile.z >= SEA_LEVEL_FILL_MIN_ZOOM &&
      !hasSource(tile, 'etopo1/') &&
      tile.minHeight <= 0 &&
      tile.heights.includes(0)
    ) {
      for (let z = SEA_LEVEL_FILL_MIN_ZOOM - 1; z >= 6; z--) {
        const shift = tile.z - z;
        const ancestor = await this.loadAncestor({
          z,
          x: tile.x >> shift,
          y: tile.y >> shift,
        }).catch(() => null);
        if (!ancestor) break;
        if (!hasSource(ancestor, 'etopo1/')) continue;
        const c = ensure();
        const pixels = fillSeaLevelFromAncestor(
          tile.heights,
          tile,
          ancestor.heights,
          ancestor,
          c.mask,
        );
        if (pixels) c.bathymetry = { fromZoom: z, sources: ancestor.sources, pixels };
        break;
      }
    }

    const applied = corrections as TileCorrections | null;
    if (applied) {
      tile.corrections = applied;
      this.stats.corrected++;
      let min = Infinity;
      let max = -Infinity;
      for (const h of tile.heights) {
        if (h < min) min = h;
        if (h > max) max = h;
      }
      tile.minHeight = min;
      tile.maxHeight = max;
    }
  }

  /**
   * Ancestors are fetched outside the queue: a queued child waiting on a queued ancestor
   * could otherwise occupy every slot and deadlock. They are few and shared, and used raw
   * (uncorrected), which is what the corrections need.
   */
  private loadAncestor(t: TileAddress): Promise<DecodedTerrainTile> {
    const key = tileKey(t);
    let request = this.ancestorRequests.get(key);
    if (!request) {
      request = this.download(t, AbortSignal.timeout(30_000)).catch((error: unknown) => {
        this.ancestorRequests.delete(key);
        throw error;
      });
      this.ancestorRequests.set(key, request);
      // Bound the raw-ancestor cache; ancestors cover large areas and are reused.
      if (this.ancestorRequests.size > 48) {
        const oldest = this.ancestorRequests.keys().next().value as string;
        this.ancestorRequests.delete(oldest);
      }
    }
    return request;
  }

  private async download(t: TileAddress, signal: AbortSignal): Promise<DecodedTerrainTile> {
    const response = await fetch(this.url(t), { signal, mode: 'cors', credentials: 'omit' });
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) this.stats.missing++;
      else this.stats.failed++;
      throw new TileNotAvailableError(t, response.status);
    }
    const blob = await response.blob();
    // colorSpaceConversion 'none' matters: a colour-managed decode would alter the RGB
    // values and therefore the heights encoded in them.
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const rgba = readPixels(bitmap);
    bitmap.close();
    const heights = decodeTerrarium(rgba, TERRARIUM_TILE_SIZE, TERRARIUM_TILE_SIZE);
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (const h of heights) {
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
    const sourcesHeader = response.headers.get('x-amz-meta-x-imagery-sources');
    this.stats.fetched++;
    return {
      ...t,
      heights,
      sources: sourcesHeader
        ? sourcesHeader
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      lastModified: response.headers.get('last-modified'),
      retrievedAt: new Date().toISOString(),
      minHeight,
      maxHeight,
      bounds: [
        tileXToLon(t.x, t.z),
        tileYToLat(t.y + 1, t.z),
        tileXToLon(t.x + 1, t.z),
        tileYToLat(t.y, t.z),
      ],
      corrections: null,
    };
  }

  private store(tile: DecodedTerrainTile): void {
    this.cache.set(tileKey(tile), tile);
    while (this.cache.size > this.maxCachedTiles) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
    this.stats.cachedTiles = this.cache.size;
  }

  clear(): void {
    this.queue.abortAll();
    this.cache.clear();
    this.ancestorRequests.clear();
    this.stats.cachedTiles = 0;
  }

  /**
   * Orthometric height at a point, bilinearly interpolated from the tile at `zoom`,
   * with the tile it came from. Rejects for latitudes outside Web Mercator coverage.
   */
  async sampleHeight(
    lon: number,
    lat: number,
    zoom = this.maxZoom,
    signal?: AbortSignal,
  ): Promise<HeightSample> {
    if (Math.abs(lat) > MERCATOR_MAX_LATITUDE) {
      throw new RangeError('Outside Terrarium coverage (Web Mercator, ±85.05°)');
    }
    const z = Math.min(zoom, this.maxZoom);
    const f = lonLatToTileFraction(lon, lat, z);
    const address = { z, x: wrapTileX(Math.floor(f.x), z), y: Math.floor(f.y) };
    const tile = await raceAbort(this.load(address, INSPECTION_PRIORITY), signal);
    const px = (f.x - Math.floor(f.x)) * TERRARIUM_TILE_SIZE;
    const py = (f.y - Math.floor(f.y)) * TERRARIUM_TILE_SIZE;
    const nearest =
      Math.min(TERRARIUM_TILE_SIZE - 1, Math.floor(py)) * TERRARIUM_TILE_SIZE +
      Math.min(TERRARIUM_TILE_SIZE - 1, Math.floor(px));
    return {
      height: sampleBilinear(tile.heights, TERRARIUM_TILE_SIZE, px, py),
      tile,
      zoom: z,
      corrections: tile.corrections?.mask[nearest] ?? 0,
    };
  }

  /** The 3x3 block of tile pixels centred on the pixel containing the point. */
  async neighbourhood(
    lon: number,
    lat: number,
    zoom = this.maxZoom,
    signal?: AbortSignal,
  ): Promise<{ window: number[]; tile: DecodedTerrainTile }> {
    const z = Math.min(zoom, this.maxZoom);
    const f = lonLatToTileFraction(lon, lat, z);
    const gx = Math.floor(f.x * TERRARIUM_TILE_SIZE);
    const gy = Math.floor(f.y * TERRARIUM_TILE_SIZE);
    const worldPixels = TERRARIUM_TILE_SIZE * 2 ** z;
    const window: number[] = [];
    let centre: DecodedTerrainTile | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = (((gx + dx) % worldPixels) + worldPixels) % worldPixels;
        const py = Math.max(0, Math.min(worldPixels - 1, gy + dy));
        const address = {
          z,
          x: Math.floor(px / TERRARIUM_TILE_SIZE),
          y: Math.floor(py / TERRARIUM_TILE_SIZE),
        };
        const tile = await raceAbort(this.load(address, INSPECTION_PRIORITY), signal);
        if (dx === 0 && dy === 0) centre = tile;
        window.push(
          tile.heights[
            (py % TERRARIUM_TILE_SIZE) * TERRARIUM_TILE_SIZE + (px % TERRARIUM_TILE_SIZE)
          ]!,
        );
      }
    }
    return { window, tile: centre! };
  }
}

export { CORRECTION };

let scratchCanvas: OffscreenCanvas | HTMLCanvasElement | undefined;

function readPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  if (!scratchCanvas) {
    scratchCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement('canvas'), {
            width: bitmap.width,
            height: bitmap.height,
          });
  }
  scratchCanvas.width = bitmap.width;
  scratchCanvas.height = bitmap.height;
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true }) as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable for terrain decoding');
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
