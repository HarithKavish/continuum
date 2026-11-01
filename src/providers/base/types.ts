// The provider contract. Every data source Continuum uses is described by metadata
// (what it is, who publishes it, under what terms, how good it is) kept separately from
// the code that talks to it. The interface asks for capabilities, never for a provider
// by name, so a component never hard-codes a particular API.

export type ProviderCategory =
  | 'terrain'
  | 'imagery'
  | 'bathymetry'
  | 'geography'
  | 'hydrology'
  | 'buildings'
  | 'natural-events'
  | 'earthquakes'
  | 'weather'
  | 'elevation'
  | 'geocoding';

export type Capability =
  | 'terrain-heightmap'
  | 'imagery-tiles'
  | 'vector-tiles'
  | 'point-elevation'
  | 'feature-feed'
  | 'point-weather'
  | 'geocode';

export type Protocol = 'xyz' | 'wmts-rest' | 'wms' | 'geojson' | 'json-rest' | 'mvt';

export type ProviderStatus = 'integrated' | 'optional' | 'future' | 'rejected';

export type TemporalKind = 'static' | 'periodic' | 'daily' | 'near-real-time';

export interface Licence {
  name: string;
  url: string;
  /** Plain statement of what the licence permits for this use. */
  notes?: string;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  organisation: string;
  category: ProviderCategory;
  capabilities: Capability[];
  dataset: string;
  description: string;
  documentationUrl: string;
  homepageUrl: string;
  endpoint: { url: string; protocol: Protocol; format: string };
  /** Continuum only integrates sources that need no credentials. */
  authentication: 'none';
  /** Verified from a real browser at a third-party origin by tools/probe-endpoints.mjs. */
  cors: { verified: boolean; verifiedOn: string; allowOrigin: string };
  coverage: { extent: 'global' | 'regional'; description: string };
  /** Native resolution of the data as documented by the provider. */
  resolution: string;
  /** Documented accuracy. `null` means the provider does not state one. */
  accuracy: { horizontal: string | null; vertical: string | null; reference: string | null };
  verticalDatum: string | null;
  /** DEM / DSM / DTM / bathymetry classification, where the source is elevation data. */
  surfaceModel?: string;
  temporal: { kind: TemporalKind; description: string };
  licence: Licence;
  attribution: { short: string; full: string };
  rateLimits: string;
  caching: string;
  limitations: string[];
  status: ProviderStatus;
}

/** A normalised event or observation, retaining its source identity. */
export interface ObservationRecord {
  /** Continuum-unique id: `${providerId}:${sourceRecordId}`. */
  id: string;
  providerId: string;
  sourceRecordId: string;
  kind: 'earthquake' | 'natural-event';
  category: string;
  title: string;
  /** ISO 8601 UTC. */
  time: string;
  updated: string | null;
  lat: number;
  lon: number;
  /** Metres relative to the provider's stated reference; negative is below. */
  elevationMeters: number | null;
  magnitude: { value: number; unit: string } | null;
  /** Polygons or tracks when the source supplies them (GeoJSON geometry). */
  geometry: GeoJSON.Geometry | null;
  properties: Record<string, string | number | boolean | null>;
  links: { label: string; url: string }[];
  attribution: string;
}

export interface ElevationSample {
  providerId: string;
  /** Metres. Orthometric unless `reference` says otherwise. */
  value: number;
  reference: string;
  resolution: string;
  surfaceModel: string;
  acquisition: string | null;
  retrievedAt: string;
  /** Provenance specific to this sample (source file, raster id, …). */
  detail: string | null;
}

export interface WeatherSample {
  providerId: string;
  time: string;
  values: { label: string; value: number; unit: string }[];
  model: string;
  retrievedAt: string;
  gridElevation: number | null;
}

export interface GeocodeResult {
  providerId: string;
  sourceRecordId: string;
  name: string;
  detail: string;
  lat: number;
  lon: number;
  /** Bounding box [south, north, west, east] when the provider supplies one. */
  bbox: [number, number, number, number] | null;
  kind: string;
}

export class ProviderError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
