// Keeps Cesium's imagery layer stack in step with the layers store: one base layer, then
// enabled overlays in catalogue order. Layers are recreated only when their URL changes
// (e.g. a new date), and removed layers release their GPU textures.

import {
  Credit,
  GeographicTilingScheme,
  ImageryLayer,
  RequestState,
  UrlTemplateImageryProvider,
  WebMapServiceImageryProvider,
  WebMercatorTilingScheme,
  type ImageryProvider,
  type TileProviderError,
  type Viewer,
} from 'cesium';
import { providerById } from '../../config/providers/catalog';
import { IMAGERY_LAYERS, type ImageryLayerDefinition } from '../../config/providers/layers';

export interface ImageryState {
  baseLayer: string;
  baseOpacity: number;
  imageryDate: string;
  overlays: Record<string, { enabled: boolean; opacity: number }>;
}

const MAX_TILE_RETRIES = 3;

let transparent: HTMLCanvasElement | undefined;
function transparentTile(): HTMLCanvasElement {
  // Full tile size: Cesium reprojects Web Mercator imagery, which fails on a 1x1 image.
  transparent ??= Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  return transparent;
}

interface Active {
  key: string;
  layer: ImageryLayer;
}

export class ImageryManager {
  private readonly active = new Map<string, Active>();
  errorCount = 0;
  onError: (() => void) | null = null;

  constructor(private readonly viewer: Viewer) {}

  sync(state: ImageryState): void {
    const wanted: { def: ImageryLayerDefinition; opacity: number }[] = [];
    const base =
      IMAGERY_LAYERS.find((l) => l.providerId === state.baseLayer && l.role === 'base') ??
      IMAGERY_LAYERS[0]!;
    wanted.push({ def: base, opacity: state.baseOpacity });
    for (const def of IMAGERY_LAYERS) {
      const o = state.overlays[def.providerId];
      if (def.role === 'overlay' && o?.enabled) wanted.push({ def, opacity: o.opacity });
    }

    const wantedIds = new Set(wanted.map((w) => w.def.providerId));
    for (const [id, a] of this.active) {
      if (!wantedIds.has(id)) {
        this.viewer.imageryLayers.remove(a.layer, true);
        this.active.delete(id);
      }
    }

    wanted.forEach(({ def, opacity }, index) => {
      const key = this.url(def, state.imageryDate);
      let entry = this.active.get(def.providerId);
      if (entry && entry.key !== key) {
        this.viewer.imageryLayers.remove(entry.layer, true);
        this.active.delete(def.providerId);
        entry = undefined;
      }
      if (!entry) {
        const layer = new ImageryLayer(this.createProvider(def, key));
        this.viewer.imageryLayers.add(layer, index);
        entry = { key, layer };
        this.active.set(def.providerId, entry);
      }
      entry.layer.alpha = opacity;
      // Keep stacking order: base at the bottom, overlays in catalogue order.
      const currentIndex = this.viewer.imageryLayers.indexOf(entry.layer);
      if (currentIndex !== index) {
        while (this.viewer.imageryLayers.indexOf(entry.layer) > index)
          this.viewer.imageryLayers.lower(entry.layer);
        while (this.viewer.imageryLayers.indexOf(entry.layer) < index)
          this.viewer.imageryLayers.raise(entry.layer);
      }
    });
    this.viewer.scene.requestRender();
  }

  activeProviderIds(): string[] {
    return [...this.active.keys()];
  }

  private url(def: ImageryLayerDefinition, date: string): string {
    return def.dated ? def.url.replace('{date}', date) : def.url;
  }

  private createProvider(def: ImageryLayerDefinition, url: string): ImageryProvider {
    const meta = providerById(def.providerId);
    // showOnScreen: attribution must be visible on the map, not tucked into a lightbox.
    const credit = new Credit(meta.attribution.short, true);
    const tilingScheme =
      def.tiling === 'geographic' ? new GeographicTilingScheme() : new WebMercatorTilingScheme();
    const provider: ImageryProvider =
      def.kind === 'wms'
        ? new WebMapServiceImageryProvider({
            url,
            layers: def.wmsLayers ?? '',
            parameters: { format: 'image/png', transparent: true, styles: '' },
            tilingScheme,
            maximumLevel: def.maximumLevel,
            credit,
          })
        : new UrlTemplateImageryProvider({
            url,
            tilingScheme,
            maximumLevel: def.maximumLevel,
            minimumLevel: def.minimumLevel ?? 0,
            credit,
          });
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
