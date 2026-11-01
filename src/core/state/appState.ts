// Application state, split by update frequency. Nothing here holds provider data beyond
// the current session; feeds and samples are replaced on refresh and dropped on reload.

import {
  DEFAULT_BASE_LAYER,
  DEFAULT_OVERLAYS,
  defaultImageryDate,
  IMAGERY_LAYERS,
  REPLACED_OVERLAYS,
} from '../../config/providers/layers';
import type { EarthquakeFeed } from '../../providers/earthquakes/usgs';
import type { ElevationSample, ObservationRecord, WeatherSample } from '../../providers/base/types';
import { loadPreferences } from './preferences';
import { createStore } from './store';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const prefs = loadPreferences();
const savedOverlays = prefs.overlays?.flatMap((id) =>
  Object.hasOwn(REPLACED_OVERLAYS, id) ? REPLACED_OVERLAYS[id]! : [id],
);

export const layersStore = createStore({
  baseLayer: prefs.baseLayer ?? DEFAULT_BASE_LAYER,
  baseOpacity: 1,
  imageryDate: defaultImageryDate(),
  overlays: Object.fromEntries(
    IMAGERY_LAYERS.filter((l) => l.role === 'overlay').map((l) => [
      l.providerId,
      {
        enabled: (savedOverlays ?? DEFAULT_OVERLAYS).includes(l.providerId),
        opacity: l.defaultOpacity,
      },
    ]),
  ) as Record<string, { enabled: boolean; opacity: number }>,
  terrainEnabled: true,
  exaggeration: 1,
  atmosphere: true,
  lighting: false,
  /** Whether the live cloud layer loops its recent frames, or holds the newest. */
  cloudsPlaying: true,
});

export interface FeedState {
  enabled: boolean;
  status: LoadState;
  count: number;
  /** ISO time the provider generated the data, when it says. */
  generated: string | null;
  retrievedAt: string | null;
  error: string | null;
}

const feed = (enabled: boolean): FeedState => ({
  enabled,
  status: 'idle',
  count: 0,
  generated: null,
  retrievedAt: null,
  error: null,
});

export const feedsStore = createStore({
  earthquakes: feed(true),
  earthquakeFeed: '2.5_week' as EarthquakeFeed,
  events: feed(true),
  eventCategories: [] as string[],
  buildings: { ...feed(true), build: null as string | null },
});

export const cameraStore = createStore({
  lat: 0,
  lon: 0,
  /** Camera height above the WGS84 ellipsoid, metres. */
  height: 0,
  /** Camera height above the rendered terrain surface, when known. */
  heightAboveGround: null as number | null,
  heading: 0,
  pitch: -90,
  pointer: null as { lat: number; lon: number } | null,
});

export interface TerrainStatus {
  inFlight: number;
  queued: number;
  delivered: number;
  failed: number;
  cancelled: number;
  deepestLevel: number;
}

export const statusStore = createStore({
  engine: 'loading' as 'loading' | 'ready' | 'webgl-unavailable' | 'error',
  engineError: null as string | null,
  terrain: {
    inFlight: 0,
    queued: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    deepestLevel: 0,
  } as TerrainStatus,
  tilesLoaded: false,
  imageryErrors: 0,
  fps: 0,
  frameMs: 0,
  memoryMB: null as number | null,
  lowPower: prefs.lowPower ?? false,
  navSpeed: 1,
  hidden: false,
  /** Frame time (ISO 8601 UTC) the cloud layer is showing, while it is on. */
  cloudTime: null as string | null,
});

export type Tool = 'inspect' | 'distance' | 'area' | 'profile';

export interface PointInspection {
  kind: 'point';
  lat: number;
  lon: number;
  requestedAt: string;
  terrain:
    | { status: 'loading' }
    | { status: 'unavailable'; reason: string }
    | {
        status: 'ready';
        orthometric: number;
        /** null when the EGM96 grid could not be loaded. */
        geoidUndulation: number | null;
        zoom: number;
        gridSpacingMeters: number;
        sources: string[];
        lastModified: string | null;
        retrievedAt: string;
        slopeDeg: number | null;
        aspectDeg: number | null;
        /** CORRECTION flags of the sampled pixel (see spatial/terrain/terrarium.ts). */
        corrections: number;
        /** Which ancestor supplied a replaced value, when one did. */
        correctionSources: { fromZoom: number; sources: string[] } | null;
      };
  elevations: Record<
    string,
    | { status: 'loading' }
    | { status: 'none' }
    | { status: 'error'; message: string }
    | { status: 'ready'; sample: ElevationSample }
  >;
  weather:
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; sample: WeatherSample };
}

export interface RecordInspection {
  kind: 'record';
  record: ObservationRecord;
}

export interface ProfileSample {
  distanceMeters: number;
  lat: number;
  lon: number;
  elevation: number | null;
}

export const selectionStore = createStore({
  tool: 'inspect' as Tool,
  inspection: null as PointInspection | RecordInspection | null,
  /** Vertices of the measurement in progress, [lon, lat]. */
  measurePoints: [] as { lon: number; lat: number }[],
  profile: null as {
    status: 'loading' | 'ready' | 'error';
    samples: ProfileSample[];
    zoom: number;
    error?: string;
  } | null,
});

// On small screens the panels start closed so the globe is visible first.
const roomy = typeof matchMedia === 'undefined' || !matchMedia('(max-width: 760px)').matches;

export const uiStore = createStore({
  leftOpen: roomy,
  rightOpen: roomy,
  dialog: null as null | 'sources' | 'controls' | 'about',
  toast: null as null | { message: string; tone: 'neutral' | 'danger'; id: number },
});

let toastId = 0;
export function showToast(message: string, tone: 'neutral' | 'danger' = 'neutral'): void {
  uiStore.set({ toast: { message, tone, id: ++toastId } });
}
