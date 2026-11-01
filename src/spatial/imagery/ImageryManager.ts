// Keeps Cesium's imagery layer stack in step with the layers store: one base layer, then
// enabled overlays in catalogue order. Layers are recreated only when their URL changes
// (e.g. a new date), and removed layers release their GPU textures. The live cloud overlay
// is a group of layers, one per frame, animated by tick().

import {
  Credit,
  GeographicTilingScheme,
  ImageryLayer,
  Rectangle,
  RequestState,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMercatorTilingScheme,
  type ImageryProvider,
  type TileProviderError,
  type Viewer,
} from 'cesium';
import { providerById } from '../../config/providers/catalog';
import {
  IMAGERY_LAYERS,
  layerDefinition,
  type ImageryLayerDefinition,
} from '../../config/providers/layers';
import { cloudFrameTimes } from './cloudImagery';
import { CloudLayer } from './CloudLayer';
import {
  NIGHT_LIGHTS,
  NIGHT_LIGHTS_BRIGHTNESS,
  NIGHT_LIGHTS_SOURCE,
  nightLightsAlpha,
} from './nightLights';
import { VectorOverlayProvider } from './VectorOverlayProvider';

export interface ImageryState {
  baseLayer: string;
  baseOpacity: number;
  imageryDate: string;
  overlays: Record<string, { enabled: boolean; opacity: number }>;
  /** Realistic day and night: city lights are drawn on the night side. */
  lighting: boolean;
}

const MAX_TILE_RETRIES = 3;
/** Hourly frames in the cloud loop: the last four hours. */
export const CLOUD_FRAMES = 5;

let transparent: HTMLCanvasElement | undefined;
function transparentTile(): HTMLCanvasElement {
  // Full tile size: Cesium reprojects Web Mercator imagery, which fails on a 1x1 image.
  transparent ??= Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  return transparent;
}

/** Pure white pixels become transparent: some aerial services fill beyond their coverage with white. */
function whiteToTransparent(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
): HTMLImageElement | HTMLCanvasElement | ImageBitmap {
  const canvas = Object.assign(document.createElement('canvas'), {
    width: image.width,
    height: image.height,
  });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Cesium decodes imagery to bitmaps already flipped vertically and uploads canvases with
  // a flip; undo the bitmap's flip here so the tile is not drawn upside down.
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(image, 0, 0);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return image; // unreadable pixels: show the tile as served
  }
  const px = data.data;
  let cleared = 0;
  for (let i = 0; i < px.length; i += 4)
    if (px[i]! >= 254 && px[i + 1]! >= 254 && px[i + 2]! >= 254) {
      px[i + 3] = 0;
      cleared++;
    }
  if (cleared) ctx.putImageData(data, 0, 0);
  return canvas;
}

interface Active {
  key: string;
  layers: ImageryLayer[];
  clouds?: CloudLayer;
}

export class ImageryManager {
  private readonly active = new Map<string, Active>();
  private cloudOpacity = 0;
  private lastState: ImageryState | null = null;
  private sinceHourCheck = 0;
  errorCount = 0;
  onError: (() => void) | null = null;
  /** Whether the cloud loop plays; when false the newest frame is shown. */
  cloudsPlaying = true;
  /** Whether clouds cast shadows (realistic lighting). */
  cloudShadows = true;

  constructor(private readonly viewer: Viewer) {}

  sync(state: ImageryState): void {
    this.lastState = state;
    const wanted: { id: string; def: ImageryLayerDefinition; opacity: number }[] = [];
    const base =
      IMAGERY_LAYERS.find((l) => l.providerId === state.baseLayer && l.role === 'base') ??
      IMAGERY_LAYERS[0]!;
    wanted.push({ id: base.providerId, def: base, opacity: state.baseOpacity });
    if (state.lighting && base.providerId !== NIGHT_LIGHTS_SOURCE)
      wanted.push({ id: NIGHT_LIGHTS, def: layerDefinition(NIGHT_LIGHTS_SOURCE), opacity: 1 });
    for (const def of IMAGERY_LAYERS) {
      const o = state.overlays[def.providerId];
      if (def.role === 'overlay' && o?.enabled)
        wanted.push({ id: def.providerId, def, opacity: o.opacity });
    }

    const wantedIds = new Set(wanted.map((w) => w.id));
    for (const [id, a] of this.active) if (!wantedIds.has(id)) this.release(id, a);

    let index = 0;
    for (const { id, def, opacity } of wanted) {
      const key =
        def.kind === 'clouds'
          ? cloudFrameTimes(new Date(), CLOUD_FRAMES).join(',')
          : this.url(def, state.imageryDate);
      let entry = this.active.get(id);
      if (entry && entry.key !== key) {
        if (entry.clouds) {
          // A new hour: keep the frames still in the loop, add the newest, drop the oldest.
          entry.clouds.setTimes(key.split(','));
          entry.layers = entry.clouds.layers;
          entry.key = key;
        } else {
          this.release(id, entry);
          entry = undefined;
        }
      }
      if (!entry) entry = this.create(id, def, key, index);
      if (entry.clouds) this.cloudOpacity = opacity;
      else for (const layer of entry.layers) layer.alpha = opacity;
      // Keep stacking order: base at the bottom, then night lights, then overlays in
      // catalogue order.
      for (const layer of entry.layers) this.moveTo(layer, index++);
    }
    this.viewer.scene.requestRender();
  }

  activeProviderIds(): string[] {
    return [...this.active.keys()];
  }

  /** The cloud frame time currently dominating the view, if the cloud layer is on. */
  cloudTime(): string | null {
    for (const a of this.active.values()) if (a.clouds) return a.clouds.shownTime;
    return null;
  }

  /**
   * Fade the night lights for the camera height, advance the cloud loop, and roll it on to
   * a new hour when one is published. Returns true when a render is needed.
   */
  tick(dtSeconds: number, cameraHeight: number): boolean {
    let changed = false;
    const night = this.active.get(NIGHT_LIGHTS)?.layers[0];
    if (night) {
      const alpha = nightLightsAlpha(cameraHeight);
      if (Math.abs(alpha - night.nightAlpha) > 0.005) {
        night.nightAlpha = alpha;
        changed = true;
      }
    }
    const entry = [...this.active.values()].find((a) => a.clouds);
    if (!entry?.clouds) return changed;
    this.sinceHourCheck += dtSeconds;
    if (this.sinceHourCheck > 30 && this.lastState) {
      this.sinceHourCheck = 0;
      if (entry.key !== cloudFrameTimes(new Date(), CLOUD_FRAMES).join(',')) {
        this.sync(this.lastState);
        return true;
      }
    }
    return (
      entry.clouds.update(
        dtSeconds,
        this.cloudsPlaying,
        this.cloudOpacity,
        cameraHeight,
        this.cloudShadows,
      ) || changed
    );
  }

  private create(id: string, def: ImageryLayerDefinition, key: string, index: number): Active {
    const credit = new Credit(providerById(def.providerId).attribution.short, true);
    let entry: Active;
    if (def.kind === 'clouds') {
      const clouds = new CloudLayer(this.viewer.imageryLayers, credit, (p) =>
        this.makeResilient(p as unknown as ImageryProvider),
      );
      clouds.setTimes(key.split(','));
      entry = { key, layers: clouds.layers, clouds };
    } else {
      const layer = new ImageryLayer(
        this.createProvider(def, key, credit),
        def.minimumTerrainLevel !== undefined
          ? { minimumTerrainLevel: def.minimumTerrainLevel }
          : {},
      );
      if (id === NIGHT_LIGHTS) {
        layer.dayAlpha = 0;
        layer.nightAlpha = nightLightsAlpha(this.viewer.camera.positionCartographic.height);
        layer.brightness = NIGHT_LIGHTS_BRIGHTNESS;
      }
      this.viewer.imageryLayers.add(layer, index);
      entry = { key, layers: [layer] };
    }
    this.active.set(id, entry);
    return entry;
  }

  private release(id: string, entry: Active): void {
    if (entry.clouds) entry.clouds.destroy();
    else for (const layer of entry.layers) this.viewer.imageryLayers.remove(layer, true);
    this.active.delete(id);
  }

  private moveTo(layer: ImageryLayer, index: number): void {
    const layers = this.viewer.imageryLayers;
    while (layers.indexOf(layer) > index) layers.lower(layer);
    while (layers.indexOf(layer) < index) layers.raise(layer);
  }

  private url(def: ImageryLayerDefinition, date: string): string {
    return def.dated ? def.url.replace('{date}', date) : def.url;
  }

  private createProvider(
    def: ImageryLayerDefinition,
    url: string,
    // showOnScreen: attribution must be visible on the map, not tucked into a lightbox.
    credit: Credit,
  ): ImageryProvider {
    if (def.kind === 'vector') {
      const vector = new VectorOverlayProvider(
        def.providerId,
        def.vectorStyle ?? 'boundaries',
        credit,
      ) as unknown as ImageryProvider;
      this.makeResilient(vector);
      return vector;
    }
    const tilingScheme =
      def.tiling === 'geographic' ? new GeographicTilingScheme() : new WebMercatorTilingScheme();
    const rectangle = def.bounds ? Rectangle.fromDegrees(...def.bounds) : undefined;
    const provider: ImageryProvider =
      def.kind === 'wms'
        ? new WebMapServiceImageryProvider({
            url,
            layers: def.wmsLayers ?? '',
            parameters: { format: 'image/png', transparent: true, styles: '' },
            tilingScheme,
            maximumLevel: def.maximumLevel,
            credit,
            ...(rectangle ? { rectangle } : {}),
          })
        : new UrlTemplateImageryProvider({
            url,
            tilingScheme,
            maximumLevel: def.maximumLevel,
            minimumLevel: def.minimumLevel ?? 0,
            credit,
            ...(rectangle ? { rectangle } : {}),
          });
    if (def.whiteIsNoData) {
      const original = provider.requestImage.bind(provider);
      provider.requestImage = (x, y, level, request) => {
        const image = original(x, y, level, request);
        return image ? Promise.resolve(image).then((i) => whiteToTransparent(i as never)) : image;
      };
    }
    this.makeResilient(provider);
    return provider;
  }

  /**
   * Public tile services fail intermittently (NASA GIBS returned HTTP 500 for up to a
   * quarter of some layers' tiles in testing; the same URLs load on the next attempt), and
   * Cesium abandons a failed tile for the rest of the session. So each tile is retried, a
   * 404 (no data there) becomes transparent at once, and a tile that still fails becomes
   * transparent and is counted: that layer is simply absent there. Cancellations (the
   * camera moved on) are passed through so Cesium can ask again.
   */
  private makeResilient(provider: ImageryProvider): void {
    const original = provider.requestImage.bind(provider);
    provider.requestImage = (x, y, level, request) => {
      const first = original(x, y, level, request);
      if (!first) return first; // throttled: Cesium asks again later
      return Promise.resolve(first).catch(async (error: unknown) => {
        if (request?.state === RequestState.CANCELLED) throw error;
        // A 404 is definitive: the provider has no tile there (sparse daily layers, dates
        // not yet published). That is absence of data, not a fault, so it is not retried
        // or counted.
        if ((error as { statusCode?: number } | null)?.statusCode === 404) return transparentTile();
        for (let attempt = 1; attempt <= MAX_TILE_RETRIES; attempt++) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          try {
            const retried = await original(x, y, level);
            if (retried) return retried;
          } catch {
            // try again
          }
        }
        this.errorCount++;
        this.onError?.();
        return transparentTile();
      });
    };
    provider.errorEvent.addEventListener((_error: TileProviderError) => {
      // Handled above; listening stops Cesium logging every transient failure.
    });
  }
}
