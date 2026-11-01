// Point elevation adapters. Each returns an ElevationSample carrying its own provenance;
// the inspector asks every adapter whose coverage includes the point and shows them side
// by side, so disagreement between sources is visible rather than hidden.

import { z } from 'zod';
import { fetchJson } from '../base/http';
import type { ElevationSample } from '../base/types';

export interface PointElevationAdapter {
  providerId: string;
  covers(lat: number, lon: number): boolean;
  query(lat: number, lon: number, signal: AbortSignal): Promise<ElevationSample | null>;
}

const openMeteo: PointElevationAdapter = {
  providerId: 'open-meteo-elevation',
  covers: (lat) => Math.abs(lat) <= 90,
  async query(lat, lon, signal) {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(6)}&longitude=${lon.toFixed(6)}`;
    const body = await fetchJson(
      this.providerId,
      url,
      z.object({ elevation: z.array(z.number().nullable()) }),
      { signal },
    );
    const value = body.elevation[0];
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return {
      providerId: this.providerId,
      value,
      reference: 'EGM2008 geoid (Copernicus DEM; not restated by Open-Meteo)',
      resolution: '90 m (GLO-90)',
      surfaceModel: 'DSM (surface incl. buildings and canopy)',
      acquisition: 'TanDEM-X 2011–2015',
      retrievedAt: new Date().toISOString(),
      detail: null,
    };
  },
};

// Approximate bounding boxes of 3DEP coverage: CONUS, Alaska, Hawaii, Puerto Rico/USVI,
// Guam/CNMI, American Samoa. EPQS itself is the final word; it returns a no-data value
// outside coverage, which is reported as "no data".
const US_BOXES: [number, number, number, number][] = [
  [24.3, 49.5, -125.0, -66.8],
  [51.0, 71.6, -180.0, -129.9],
  [51.0, 53.0, 172.0, 180.0],
  [18.8, 22.4, -160.4, -154.7],
  [17.6, 18.6, -67.4, -64.5],
  [13.2, 20.6, 144.6, 146.1],
  [-14.6, -11.0, -171.2, -168.1],
];

const epqs: PointElevationAdapter = {
  providerId: 'usgs-epqs',
  covers: (lat, lon) =>
    US_BOXES.some(([s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e),
  async query(lat, lon, signal) {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lon.toFixed(6)}&y=${lat.toFixed(6)}&wkid=4326&units=Meters&includeDate=true`;
    const body = await fetchJson(
      this.providerId,
      url,
      z.object({
        value: z.union([z.string(), z.number()]),
        rasterId: z.number().optional(),
        resolution: z.number().optional(),
        attributes: z.object({ AcquisitionDate: z.string().optional() }).partial().optional(),
      }),
      { signal, timeoutMs: 30_000 },
    );
    const value = Number(body.value);
    // EPQS reports -1000000 outside coverage.
    if (!Number.isFinite(value) || value <= -999_999) return null;
    return {
      providerId: this.providerId,
      value,
      reference: 'NAVD88 (CONUS); local datums in territories',
      resolution: body.resolution
        ? `${body.resolution} m (layer reported by EPQS)`
        : 'reported layer unknown',
      surfaceModel: 'DTM (bare earth)',
      acquisition: body.attributes?.AcquisitionDate ?? null,
      retrievedAt: new Date().toISOString(),
      detail: body.rasterId !== undefined ? `3DEP raster ${body.rasterId}` : null,
    };
  },
};

const noaa: PointElevationAdapter = {
  providerId: 'noaa-ncei-dem',
  covers: (lat) => Math.abs(lat) <= 90,
  async query(lat, lon, signal) {
    const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    const params = new URLSearchParams({
      geometry,
      geometryType: 'esriGeometryPoint',
      returnGeometry: 'false',
      returnCatalogItems: 'true',
      f: 'json',
    });
    const url = `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify?${params}`;
    const body = await fetchJson(
      this.providerId,
      url,
      z.object({
        value: z.string().optional(),
        catalogItems: z
          .object({
            features: z.array(z.object({ attributes: z.record(z.string(), z.unknown()) })),
          })
          .nullable()
          .optional(),
        error: z.object({ message: z.string() }).optional(),
      }),
      { signal },
    );
    const value = Number(body.value);
    if (body.error || !Number.isFinite(value) || body.value === 'NoData') return null;
    // The finest-resolution catalogue item that is a named DEM, when the service lists one.
    const items = (body.catalogItems?.features ?? []).map((f) => f.attributes);
    const named = items
      .filter((a) => typeof a.DemName === 'string' && a.DemName)
      .sort(
        (a, b) =>
          Number(a.CellsizeArcseconds ?? Infinity) - Number(b.CellsizeArcseconds ?? Infinity),
      )[0];
    return {
      providerId: this.providerId,
      value,
      reference: named?.VerticalDatum ? String(named.VerticalDatum) : 'not reported for this point',
      resolution: named?.CellsizeArcseconds
        ? `${named.CellsizeArcseconds}″ (${String(named.DemName)})`
        : 'not reported for this point',
      surfaceModel: 'Integrated topography–bathymetry',
      // ArcGIS reports dates as epoch milliseconds.
      acquisition:
        typeof named?.DateCompleted === 'number'
          ? `DEM completed ${new Date(named.DateCompleted).toISOString().slice(0, 10)}`
          : null,
      retrievedAt: new Date().toISOString(),
      detail: named ? String(named.DemName) : null,
    };
  },
};

export const POINT_ELEVATION_ADAPTERS: PointElevationAdapter[] = [openMeteo, epqs, noaa];
