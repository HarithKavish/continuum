// The work of point inspection and elevation profiles, loaded with the first of either
// (core/inspection.ts starts and cancels them). Every value shown in the inspector comes
// from a request made here, with its provenance; anything a source does not provide is
// left unavailable rather than estimated.

import { POINT_ELEVATION_ADAPTERS } from '../providers/elevation/pointElevation';
import { fetchCurrentWeather } from '../providers/weather/openMeteo';
import { ProviderError } from '../providers/base/types';
import { geoidStatus, geoidUndulation, loadGeoid } from '../spatial/geoid/egm96';
import { densifyPath } from '../spatial/measurements/geodesic';
import {
  CORRECTION,
  hornSlope,
  MERCATOR_MAX_LATITUDE,
  mercatorPixelSpacingMeters,
  TERRARIUM_MAX_ZOOM,
} from '../spatial/terrain/terrarium';
import type { TerrariumTileSource } from '../spatial/terrain/TerrariumTileSource';
import { isCurrentProfile } from './inspection';
import { isAbortError } from './net/RequestQueue';
import { type PointInspection, type ProfileSample, selectionStore } from './state/appState';

function patch(id: string, update: (i: PointInspection) => PointInspection): void {
  selectionStore.set((s) => {
    const i = s.inspection;
    if (!i || i.kind !== 'point' || i.requestedAt !== id) return {};
    return { inspection: update(i) };
  });
}

export function inspectPoint(
  source: TerrariumTileSource,
  lat: number,
  lon: number,
  controller: AbortController,
): void {
  const { signal } = controller;
  const requestedAt = new Date().toISOString();
  const adapters = POINT_ELEVATION_ADAPTERS.filter((a) => a.covers(lat, lon));
  selectionStore.set({
    inspection: {
      kind: 'point',
      lat,
      lon,
      requestedAt,
      terrain: { status: 'loading' },
      elevations: Object.fromEntries(
        adapters.map((a) => [a.providerId, { status: 'loading' as const }]),
      ),
      weather: { status: 'loading' },
    },
  });

  // Terrain at the deepest available zoom, with a 3x3 neighbourhood for slope.
  void (async () => {
    if (Math.abs(lat) > MERCATOR_MAX_LATITUDE) {
      patch(requestedAt, (i) => ({
        ...i,
        terrain: {
          status: 'unavailable',
          reason: 'Terrain Tiles do not cover latitudes beyond ±85.05° (Web Mercator limit).',
        },
      }));
      return;
    }
    try {
      const zoom = TERRARIUM_MAX_ZOOM;
      const [{ height, tile, corrections }, { window }] = await Promise.all([
        source.sampleHeight(lon, lat, zoom, signal),
        source.neighbourhood(lon, lat, zoom, signal),
        loadGeoid().catch(() => undefined),
      ]);
      const spacingX = mercatorPixelSpacingMeters(lat, zoom);
      const replacedFrom =
        corrections & CORRECTION.bathymetry
          ? tile.corrections?.bathymetry
          : corrections & CORRECTION.iceSurface
            ? tile.corrections?.iceSurface
            : null;
      const replaced = !!replacedFrom;
      const slope = hornSlope(window, spacingX, spacingX);
      patch(requestedAt, (i) => ({
        ...i,
        terrain: {
          status: 'ready',
          orthometric: height,
          geoidUndulation: geoidStatus() === 'ready' ? geoidUndulation(lat, lon) : null,
          zoom,
          gridSpacingMeters: spacingX,
          sources: tile.sources,
          lastModified: tile.lastModified,
          retrievedAt: tile.retrievedAt,
          // Slope across values replaced from a coarser tile would mix two resolutions; omit it.
          slopeDeg: replaced ? null : slope.slopeDeg,
          aspectDeg: replaced ? null : slope.aspectDeg,
          corrections,
          correctionSources: replacedFrom
            ? { fromZoom: replacedFrom.fromZoom, sources: replacedFrom.sources }
            : null,
        },
      }));
    } catch (error) {
      if (isAbortError(error) && signal.aborted) return;
      patch(requestedAt, (i) => ({
        ...i,
        terrain: { status: 'unavailable', reason: describe(error) },
      }));
    }
  })();

  for (const adapter of adapters) {
    void adapter
      .query(lat, lon, signal)
      .then((sample) =>
        patch(requestedAt, (i) => ({
          ...i,
          elevations: {
            ...i.elevations,
            [adapter.providerId]: sample ? { status: 'ready', sample } : { status: 'none' },
          },
        })),
      )
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        patch(requestedAt, (i) => ({
          ...i,
          elevations: {
            ...i.elevations,
            [adapter.providerId]: { status: 'error', message: describe(error) },
          },
        }));
      });
  }

  void fetchCurrentWeather(lat, lon, signal)
    .then((sample) => patch(requestedAt, (i) => ({ ...i, weather: { status: 'ready', sample } })))
    .catch((error: unknown) => {
      if (isAbortError(error)) return;
      patch(requestedAt, (i) => ({ ...i, weather: { status: 'error', message: describe(error) } }));
    });
}

/**
 * Elevation profile along a geodesic path, sampled from Terrain Tiles at the zoom whose
 * grid spacing best matches the sample spacing. Values are the sources' orthometric
 * heights (approximately above mean sea level).
 */
export async function computeProfile(
  source: TerrariumTileSource,
  points: { lon: number; lat: number }[],
  controller: AbortController,
): Promise<void> {
  if (points.length < 2) {
    selectionStore.set({ profile: null });
    return;
  }
  const samples = densifyPath(points, 256);
  const total = samples[samples.length - 1]!.distanceMeters;
  const spacing = total / (samples.length - 1);
  const midLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  // Choose the zoom whose tile-grid spacing is just finer than the sample spacing.
  let zoom = 0;
  while (zoom < TERRARIUM_MAX_ZOOM && mercatorPixelSpacingMeters(midLat, zoom) > spacing) zoom++;
  selectionStore.set({ profile: { status: 'loading', samples: [], zoom } });
  try {
    const out: ProfileSample[] = await Promise.all(
      samples.map(async ({ point, distanceMeters }) => {
        if (Math.abs(point.lat) > MERCATOR_MAX_LATITUDE)
          return { distanceMeters, ...point, elevation: null };
        const { height } = await source.sampleHeight(point.lon, point.lat, zoom, controller.signal);
        return { distanceMeters, ...point, elevation: height };
      }),
    );
    if (isCurrentProfile(controller))
      selectionStore.set({ profile: { status: 'ready', samples: out, zoom } });
  } catch (error) {
    // Superseded or cancelled by the user: say nothing. Any other abort is a failure.
    if (isAbortError(error) && controller.signal.aborted) return;
    selectionStore.set({ profile: { status: 'error', samples: [], zoom, error: describe(error) } });
  }
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
