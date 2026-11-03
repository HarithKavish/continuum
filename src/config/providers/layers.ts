// Rendering definitions for imagery-tile providers: how each catalogue entry becomes a
// Cesium imagery layer. Metadata (licence, accuracy, attribution) stays in catalog.ts.

export type LayerRole = 'base' | 'overlay';

export interface ImageryLayerDefinition {
  providerId: string;
  role: LayerRole;
  label: string;
  /** Group shown in the layer panel. */
  group:
    | 'Satellite imagery'
    | 'Aerial photos'
    | 'Geographic features'
    | 'Hydrology'
    | 'Bathymetry and ocean'
    | 'Weather';
  /** 'clouds' is the live geostationary layer (CloudLayer), a set of animated frames. */
  kind: 'xyz' | 'wms' | 'vector' | 'clouds';
  /** URL template; {date} is substituted with the selected UTC date (YYYY-MM-DD). */
  url: string;
  /** For kind 'vector': what VectorOverlayProvider draws. */
  vectorStyle?: 'boundaries' | 'places' | 'roads' | 'water' | 'buildings';
  /** Where the provider has data, [west, south, east, north] degrees; nothing is requested outside. */
  bounds?: [number, number, number, number];
  /** Shown only on terrain tiles at least this deep (so close-up layers load only close up). */
  minimumTerrainLevel?: number;
  /** The provider fills tiles beyond its coverage with pure white; draw that as no data. */
  whiteIsNoData?: boolean;
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
  aerialPhotos(
    'ign-orthophotos',
    'France (IGN, 20 cm)',
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
    19,
    [-5.3, 41.3, 9.7, 51.2],
    true,
  ),
  aerialPhotos(
    'pdok-luchtfoto',
    'Netherlands (PDOK, 8 cm)',
    'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    21,
    [3.2, 50.7, 7.3, 53.7],
    true,
  ),
  aerialPhotos(
    'swisstopo-swissimage',
    'Switzerland (swisstopo, 10 cm)',
    'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    20,
    [5.9, 45.8, 10.6, 47.9],
  ),
  aerialPhotos(
    'basemap-at-orthofoto',
    'Austria (basemap.at)',
    'https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
    20,
    [9.5, 46.3, 17.2, 49.1],
  ),
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
  {
    providerId: 'geostationary-clouds',
    role: 'overlay',
    label: 'Live clouds (satellite infrared)',
    group: 'Weather',
    kind: 'clouds',
    url: '',
    tiling: 'mercator',
    maximumLevel: 5,
    dated: false,
    defaultOpacity: 0.85,
    hint: 'The latest hour from five geostationary satellites, with shadows under realistic lighting. Fades out as you zoom in.',
  },
  {
    providerId: 'openfreemap-water',
    role: 'overlay',
    label: 'Lakes, rivers and canals',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'water',
    url: 'https://tiles.openfreemap.org/planet',
    tiling: 'mercator',
    maximumLevel: 19,
    dated: false,
    defaultOpacity: 1,
    hint: 'Lakes and tanks (seasonal ones dashed), rivers, canals and drains, with their names.',
  },
  {
    providerId: 'overture-buildings',
    role: 'overlay',
    label: 'Buildings',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'buildings',
    url: 'https://stac.overturemaps.org/catalog.json',
    tiling: 'mercator',
    maximumLevel: 19,
    minimumTerrainLevel: 14,
    dated: false,
    defaultOpacity: 1,
    hint: 'Footprints of mapped and machine-detected buildings, at neighbourhood scale.',
  },
  {
    providerId: 'openfreemap-roads',
    role: 'overlay',
    label: 'Roads and railways',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'roads',
    url: 'https://tiles.openfreemap.org/planet',
    tiling: 'mercator',
    maximumLevel: 19,
    dated: false,
    defaultOpacity: 1,
    hint: 'Motorways from afar, down to lanes and footpaths up close, with street names.',
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
    label: 'Place names and points of interest',
    group: 'Geographic features',
    kind: 'vector',
    vectorStyle: 'places',
    url: 'https://tiles.openfreemap.org/planet',
    tiling: 'mercator',
    maximumLevel: 19,
    dated: false,
    defaultOpacity: 1,
    hint: 'Fewer, larger places from afar; towns and neighbourhoods, then stations, hospitals, temples, schools and shops as you zoom in.',
  },
];

/**
 * A national aerial-photo overlay: requested only inside its country's rectangle and only
 * on close-up terrain, so it adds nothing to the view elsewhere.
 */
function aerialPhotos(
  providerId: string,
  label: string,
  url: string,
  maximumLevel: number,
  bounds: [number, number, number, number],
  whiteIsNoData = false,
): ImageryLayerDefinition {
  return {
    providerId,
    role: 'overlay',
    label,
    group: 'Aerial photos',
    kind: 'xyz',
    url,
    tiling: 'mercator',
    maximumLevel,
    bounds,
    minimumTerrainLevel: 12,
    ...(whiteIsNoData ? { whiteIsNoData } : {}),
    dated: false,
    defaultOpacity: 1,
  };
}

export const DEFAULT_BASE_LAYER = 'eox-s2cloudless';
export const DEFAULT_OVERLAYS = [
  'ign-orthophotos',
  'pdok-luchtfoto',
  'swisstopo-swissimage',
  'basemap-at-orthofoto',
  'geostationary-clouds',
  'openfreemap-water',
  'overture-buildings',
  'openfreemap-roads',
  'openfreemap-boundaries',
  'openfreemap-places',
];

/** Overlays that replaced earlier ones, so a reader's saved choice carries over. */
export const REPLACED_OVERLAYS: Record<string, string[]> = {
  'gibs-reference-labels': ['openfreemap-boundaries', 'openfreemap-places'],
  'gibs-reference-features': ['openfreemap-boundaries'],
};

/**
 * The overlays of the releases before #8, which saved choices without recording which
 * overlays they had seen. Those choices decide only these; roads, buildings, aerial photos
 * and clouds start at their defaults. (A reader who switched one of those off under #8
 * sees it back once: their saved list cannot be told apart from an older one.)
 */
export const OVERLAYS_BEFORE_KNOWN = [
  'gibs-reference-labels',
  'gibs-reference-features',
  'openfreemap-boundaries',
  'openfreemap-places',
  'gibs-coastlines',
  'gibs-surface-water',
  'gibs-flood',
  'gebco-2026',
  'gibs-sst',
  'gibs-precipitation',
];

export function layerDefinition(providerId: string): ImageryLayerDefinition {
  const def = IMAGERY_LAYERS.find((l) => l.providerId === providerId);
  if (!def) throw new Error(`No imagery layer for ${providerId}`);
  return def;
}

/** Yesterday in UTC: today's daily composites are often still being processed. */
export function defaultImageryDate(now = new Date()): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}
