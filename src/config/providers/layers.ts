// Rendering definitions for imagery-tile providers: how each catalogue entry becomes a
// Cesium imagery layer. Metadata (licence, accuracy, attribution) stays in catalog.ts.

export type LayerRole = 'base' | 'overlay';

export interface ImageryLayerDefinition {
  providerId: string;
  role: LayerRole;
  label: string;
  /** Group shown in the layer panel. */
  group:
    'Satellite imagery' | 'Geographic features' | 'Hydrology' | 'Bathymetry and ocean' | 'Weather';
  kind: 'xyz' | 'wms' | 'vector';
  /** URL template; {date} is substituted with the selected UTC date (YYYY-MM-DD). */
  url: string;
  /** For kind 'vector': which OpenMapTiles layer is drawn (VectorOverlayProvider). */
  vectorStyle?: 'boundaries' | 'places';
  tiling: 'geographic' | 'mercator';
  minimumLevel?: number;
  /** Deepest level requested; Cesium upsamples beyond it rather than requesting more. */
  maximumLevel: number;
  dated: boolean;
  /** WMS layer name, for kind 'wms'. */
  wmsLayers?: string;
  defaultOpacity: number;
  /** Short note shown under the control. */
  hint?: string;
  /** Provider-defined colour classes, shown when the layer is on. */
  legend?: { color: string; label: string }[];
}

export const IMAGERY_LAYERS: ImageryLayerDefinition[] = [
  {
    providerId: 'eox-s2cloudless',
    role: 'base',
    label: 'Sentinel-2 cloudless 2025 (10 m)',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{y}/{x}.jpg',
    tiling: 'geographic',
    maximumLevel: 14,
    dated: false,
    defaultOpacity: 1,
    hint: 'Annual cloud-free mosaic. Non-commercial licence.',
  },
  {
    providerId: 'gibs-viirs-noaa20',
    role: 'base',
    label: 'VIIRS NOAA-20 daily (250 m)',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    tiling: 'mercator',
    maximumLevel: 9,
    dated: true,
    defaultOpacity: 1,
    hint: 'One day of satellite passes, clouds included.',
  },
  {
    providerId: 'gibs-modis-terra',
    role: 'base',
    label: 'MODIS Terra daily (250 m)',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    tiling: 'mercator',
    maximumLevel: 9,
    dated: true,
    defaultOpacity: 1,
    hint: 'Daily since February 2000. Orbit gaps appear black.',
  },
  {
    providerId: 'gibs-blue-marble',
    role: 'base',
    label: 'Blue Marble with bathymetry (500 m)',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    tiling: 'mercator',
    maximumLevel: 8,
    dated: false,
    defaultOpacity: 1,
  },
  {
    providerId: 'gibs-black-marble',
    role: 'base',
    label: 'Black Marble night lights 2016',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 8,
    dated: false,
    defaultOpacity: 1,
  },
  {
    providerId: 'usgs-imagery',
    role: 'base',
    label: 'USGS orthoimagery (US, ~1 m)',
    group: 'Satellite imagery',
    kind: 'xyz',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    tiling: 'mercator',
    maximumLevel: 16,
    dated: false,
    defaultOpacity: 1,
    hint: 'United States only.',
  },
  {
    providerId: 'openfreemap-boundaries',
    role: 'overlay',
    label: 'Borders',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'boundaries',
    url: 'https://tiles.openfreemap.org/planet',
    tiling: 'mercator',
    maximumLevel: 19,
    dated: false,
    defaultOpacity: 1,
    hint: 'Countries; states from continental scale; districts from regional scale.',
  },
  {
    providerId: 'openfreemap-places',
    role: 'overlay',
    label: 'Place names',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'places',
    url: 'https://tiles.openfreemap.org/planet',
    tiling: 'mercator',
    maximumLevel: 19,
    dated: false,
    defaultOpacity: 1,
    hint: 'Fewer, larger places from afar; towns, villages and neighbourhoods as you zoom in.',
  },
  {
    providerId: 'gibs-coastlines',
    role: 'overlay',
    label: 'Coastlines',
    group: 'Geographic features',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Coastlines_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 13,
    dated: false,
    defaultOpacity: 0.8,
  },
  {
    providerId: 'gibs-surface-water',
    role: 'overlay',
    label: 'Surface water (OPERA, 30 m)',
    group: 'Hydrology',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OPERA_L3_Dynamic_Surface_Water_Extent-HLS/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 12,
    dated: true,
    defaultOpacity: 0.9,
    hint: 'Sparse, and published days after acquisition: if nothing appears, choose a date a week or more back.',
  },
  {
    providerId: 'gibs-flood',
    role: 'overlay',
    label: 'Flood water (VIIRS, 1-day)',
    group: 'Hydrology',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Combined_Flood_1-Day/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 9,
    dated: true,
    defaultOpacity: 0.7,
    hint: 'A classification map: it covers the imagery wherever it has a class.',
    // From the GIBS colour map for this layer (colormaps/v1.3/MODIS_Flood.xml).
    legend: [
      { color: 'rgb(50,210,245)', label: 'Surface water' },
      { color: 'rgb(255,255,0)', label: 'Recurring flood' },
      { color: 'rgb(250,30,36)', label: 'Flood' },
      { color: 'rgb(175,175,175)', label: 'Insufficient data (cloud, night)' },
    ],
  },
  {
    providerId: 'gebco-2026',
    role: 'overlay',
    label: 'GEBCO 2026 bathymetry (colour)',
    group: 'Bathymetry and ocean',
    kind: 'wms',
    url: 'https://wms.gebco.net/mapserv?',
    wmsLayers: 'GEBCO_LATEST_2',
    tiling: 'geographic',
    maximumLevel: 9,
    dated: false,
    defaultOpacity: 0.85,
    hint: 'A picture of the grid, not elevation data.',
  },
  {
    providerId: 'gibs-sst',
    role: 'overlay',
    label: 'Sea surface temperature (MUR)',
    group: 'Bathymetry and ocean',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 7,
    dated: true,
    defaultOpacity: 0.8,
  },
  {
    providerId: 'gibs-precipitation',
    role: 'overlay',
    label: 'Precipitation rate (IMERG)',
    group: 'Weather',
    kind: 'xyz',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    tiling: 'mercator',
    maximumLevel: 6,
    dated: true,
    defaultOpacity: 0.8,
  },
];

export const DEFAULT_BASE_LAYER = 'eox-s2cloudless';
export const DEFAULT_OVERLAYS = ['openfreemap-boundaries', 'openfreemap-places'];

/** Overlays that replaced earlier ones, so a reader's saved choice carries over. */
export const REPLACED_OVERLAYS: Record<string, string[]> = {
  'gibs-reference-labels': ['openfreemap-boundaries', 'openfreemap-places'],
  'gibs-reference-features': ['openfreemap-boundaries'],
};

export function layerDefinition(providerId: string): ImageryLayerDefinition {
  const def = IMAGERY_LAYERS.find((l) => l.providerId === providerId);
  if (!def) throw new Error(`No imagery layer for ${providerId}`);
  return def;
}

/** Yesterday in UTC: today's daily composites are often still being processed. */
export function defaultImageryDate(now = new Date()): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}
