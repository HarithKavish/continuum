// What each Terrain Tiles source file prefix means. The prefixes were observed in the
// x-amz-meta-x-imagery-sources header of live tiles (docs/RESEARCH.md § Terrain findings).
// Accuracy is quoted only where the dataset's producer documents it; otherwise null.

export interface TerrainSourceInfo {
  prefix: string;
  name: string;
  resolution: string;
  /** DEM is used generically; DSM includes surface objects; DTM is bare earth. */
  surfaceModel: string;
  verticalDatum: string;
  verticalAccuracy: string | null;
  horizontalAccuracy: string | null;
  acquisition: string | null;
  reference: string;
  note?: string;
}

export const TERRAIN_SOURCES: TerrainSourceInfo[] = [
  {
    prefix: 'srtm/',
    name: 'NASA SRTM (Shuttle Radar Topography Mission)',
    resolution: '1 arc-second (~30 m)',
    surfaceModel: 'DSM-like: C-band radar returns include vegetation canopy and buildings',
    verticalDatum: 'EGM96 geoid',
    verticalAccuracy: 'Mission specification: 16 m absolute (90% linear error)',
    horizontalAccuracy: 'Mission specification: 20 m absolute (90% circular error)',
    acquisition: 'February 2000',
    reference: 'https://www.earthdata.nasa.gov/data/instruments/srtm',
  },
  {
    prefix: 'gmted/',
    name: 'USGS/NGA GMTED2010',
    resolution: '7.5 arc-seconds (~225 m; "mea075") or 30 arc-seconds ("mea300")',
    surfaceModel: 'DEM (mean elevation of aggregated sources)',
    verticalDatum: 'EGM96 geoid',
    verticalAccuracy: 'RMSE 26–30 m (7.5″ product, Danielson & Gesch 2011)',
    horizontalAccuracy: null,
    acquisition: 'Compiled 2010 from sources of various dates',
    reference: 'https://pubs.usgs.gov/of/2011/1073/',
    note: 'Fills water bodies with 0 m.',
  },
  {
    prefix: 'etopo1/',
    name: 'NOAA ETOPO1 Bedrock',
    resolution: '1 arc-minute (~1.85 km)',
    surfaceModel: 'Topography and bathymetry; bedrock version (beneath ice sheets)',
    verticalDatum: 'Sea level',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: 'Compiled 2008 from many surveys',
    reference: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model',
    note: 'The bedrock grid shows rock beneath Antarctic and Greenland ice, not the ice surface.',
  },
  {
    prefix: 'ned13/',
    name: 'USGS 3DEP 1/3 arc-second DEM',
    resolution: '1/3 arc-second (~10 m)',
    surfaceModel: 'DTM (bare earth)',
    verticalDatum: 'NAVD88 (conterminous US)',
    verticalAccuracy: 'RMSE 1.55 m against geodetic control (Gesch, Oimoen & Evans 2014)',
    horizontalAccuracy: null,
    acquisition: 'Varies by project',
    reference: 'https://pubs.usgs.gov/sir/2014/5008/',
  },
  {
    prefix: 'ned/',
    name: 'USGS 3DEP 1/9 arc-second / NED topobathy',
    resolution: '1/9 arc-second (~3 m)',
    surfaceModel: 'DTM (bare earth, lidar-derived); topobathymetric in California',
    verticalDatum: 'NAVD88',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: 'Year in the file name where present',
    reference: 'https://www.usgs.gov/3d-elevation-program',
  },
  {
    prefix: 'eudem/',
    name: 'Copernicus EU-DEM v1.0',
    resolution: '1 arc-second (~25 m)',
    surfaceModel: 'DSM (hybrid of SRTM and ASTER GDEM)',
    verticalDatum: 'EVRS2000',
    verticalAccuracy: 'RMSE 2.9 m (EU-DEM v1.0 statistical validation report)',
    horizontalAccuracy: null,
    acquisition: 'Built 2013 from SRTM (2000) and ASTER GDEM',
    reference:
      'https://land.copernicus.eu/en/products/products-that-are-no-longer-disseminated-on-the-clms-website',
  },
  {
    prefix: 'austria/',
    name: 'Austria DGM (Digitales Geländemodell)',
    resolution: '10 m',
    surfaceModel: 'DTM (airborne laser scanning)',
    verticalDatum: 'Austrian national height system (not restated by the tile producer)',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: null,
    reference: 'https://www.data.gv.at/katalog/dataset/b5de6975-417b-4320-afdb-eb2a9e2a1dbf',
  },
  {
    prefix: 'uk_lidar/',
    name: 'Environment Agency LIDAR DTM (England)',
    resolution: '2 m',
    surfaceModel: 'DTM (bare earth)',
    verticalDatum: 'Ordnance Datum Newlyn',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: null,
    reference: 'https://environment.data.gov.uk/survey',
  },
  {
    prefix: 'nrcan_cdem/',
    name: 'Natural Resources Canada CDEM',
    resolution: '0.75–12 arc-seconds (~20–400 m, varies with latitude)',
    surfaceModel: 'DEM',
    verticalDatum: 'CGVD28',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: null,
    reference: 'https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333',
  },
  {
    prefix: 'kartverket/',
    name: 'Kartverket national DTM (Norway)',
    resolution: '10 m',
    surfaceModel: 'DTM',
    verticalDatum: 'Norwegian national height system (not restated by the tile producer)',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: null,
    reference: 'https://www.kartverket.no/',
  },
  {
    prefix: 'nzlinz/',
    name: 'LINZ 8 m DEM (New Zealand)',
    resolution: '8 m',
    surfaceModel: 'DEM',
    verticalDatum: 'Not restated by the tile producer',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: '2012',
    reference: 'https://data.linz.govt.nz/layer/51768-nz-8m-digital-elevation-model-2012/',
  },
  {
    prefix: 'mx_lidar/',
    name: 'INEGI continental relief (Mexico)',
    resolution: 'Not restated by the tile producer (≈ 5 m lidar-derived per file naming)',
    surfaceModel: 'DEM',
    verticalDatum: 'Not restated by the tile producer',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: '2016 release',
    reference: 'https://www.inegi.org.mx/temas/relieve/continental/',
  },
  {
    prefix: 'pgdc_5m/',
    name: 'ArcticDEM 5 m mosaic v2.0 (Polar Geospatial Center)',
    resolution: '5 m',
    surfaceModel: 'DSM (stereo-photogrammetric from commercial satellite imagery)',
    verticalDatum: 'WGS84 ellipsoid in the tiles; converted by Continuum to EGM96 orthometric',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: 'Mosaic of strips, mostly 2011–2017',
    reference: 'https://www.pgc.umn.edu/data/arcticdem/',
  },
  {
    prefix: 'geoscience_au/',
    name: 'Geoscience Australia coastal LiDAR DEM',
    resolution: '5 m',
    surfaceModel: 'DEM',
    verticalDatum: 'AHD (Australian Height Datum)',
    verticalAccuracy: null,
    horizontalAccuracy: null,
    acquisition: null,
    reference: 'https://ecat.ga.gov.au/',
  },
];

export function terrainSourceFor(file: string): TerrainSourceInfo | null {
  return TERRAIN_SOURCES.find((s) => file.startsWith(s.prefix)) ?? null;
}
