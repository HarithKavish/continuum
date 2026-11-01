// The provider catalogue: metadata for every source Continuum integrates. This is data,
// not code — adapters in src/providers/ implement the behaviour. The same facts are
// documented, with sources, in docs/DATA_SOURCES.md; keep the two in step.

import type { ProviderMetadata } from '../../providers/base/types';

const VERIFIED = '2026-11-01';

const gibsCommon = {
  organisation: 'NASA ESDIS — Global Imagery Browse Services (GIBS)',
  documentationUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
  homepageUrl:
    'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api',
  authentication: 'none',
  cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
  licence: {
    name: 'NASA open data (no use restrictions)',
    url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy',
    notes: 'NASA requests acknowledgement of GIBS in clients and presentations.',
  },
  rateLimits: 'None published. Continuum caps concurrent requests per host.',
  verticalDatum: null,
  status: 'integrated',
} as const;

const gibsAttribution = 'Imagery: NASA GIBS, part of NASA ESDIS';

const openFreeMapCommon = {
  organisation: 'OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data',
  homepageUrl: 'https://openfreemap.org/',
  endpoint: {
    url: 'https://tiles.openfreemap.org/planet',
    protocol: 'mvt',
    format: 'Mapbox Vector Tiles via TileJSON',
  },
  authentication: 'none',
  cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
  accuracy: { horizontal: null, vertical: null, reference: null },
  verticalDatum: null,
  temporal: {
    kind: 'periodic',
    description: 'Planet rebuilt regularly; the active build date is reported in the TileJSON URL.',
  },
  licence: {
    name: 'ODbL (data); OpenMapTiles schema (BSD/CC-BY)',
    url: 'https://www.openstreetmap.org/copyright',
  },
  attribution: {
    short: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    full: 'OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL).',
  },
  rateLimits: 'No limits on map views; please keep request volume reasonable.',
  caching: 'Cache-Control on tiles from the provider; TileJSON max-age=3600.',
  status: 'integrated',
} as const;

type AerialShared =
  | 'category'
  | 'capabilities'
  | 'authentication'
  | 'cors'
  | 'accuracy'
  | 'verticalDatum'
  | 'rateLimits'
  | 'caching'
  | 'status';

/** A national aerial-photo service: open, browser-accessible, accuracy not stated. */
function aerialPhotos(entry: Omit<ProviderMetadata, AerialShared>): ProviderMetadata {
  return {
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    rateLimits: 'None published.',
    caching: 'Provider cache headers.',
    status: 'integrated',
    ...entry,
  };
}

export const PROVIDERS: ProviderMetadata[] = [
  {
    id: 'aws-terrain-tiles',
    name: 'Terrain Tiles (Terrarium)',
    organisation: 'Mapzen / Tilezen (Linux Foundation), hosted on the AWS Open Data Registry',
    category: 'terrain',
    capabilities: ['terrain-heightmap', 'point-elevation'],
    dataset: 'Joerd composite global DEM, Terrarium PNG encoding, v1.1 (2017)',
    description:
      'Global elevation and bathymetry merged from SRTM, GMTED2010, ETOPO1, USGS 3DEP and national datasets, tiled on the Web Mercator grid to zoom 15.',
    documentationUrl: 'https://github.com/tilezen/joerd/tree/master/docs',
    homepageUrl: 'https://registry.opendata.aws/terrain-tiles/',
    endpoint: {
      url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      protocol: 'xyz',
      format: 'PNG, height = (R·256 + G + B/256) − 32768 m',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description:
        'Web Mercator extent (±85.05° latitude). Land from SRTM (60°N–56°S), 3DEP (US), ArcticDEM and national DEMs; oceans from ETOPO1.',
    },
    resolution:
      'Varies by place and zoom: ~3 m (UK LIDAR) to 10 m (3DEP, EU national), 30 m (SRTM), 7.5″–30″ (GMTED2010), 1′ (ETOPO1 oceans). Tile grid at z15 ≈ 4.8 m × cos(latitude).',
    accuracy: {
      horizontal: null,
      vertical: null,
      reference: 'https://github.com/tilezen/joerd/blob/master/docs/data-sources.md',
    },
    verticalDatum:
      'Not harmonised by the producer. Inherited from each source: EGM96 geoid (SRTM, GMTED2010), NAVD88 (USGS 3DEP), mean sea level (ETOPO1).',
    surfaceModel:
      'Mixed. SRTM is a radar surface model (DSM-like); 3DEP and the national LIDAR products are bare-earth DTMs; ETOPO1 is bathymetry/topography.',
    temporal: {
      kind: 'static',
      description:
        'Built 2016 (v1) and 2017 (v1.1). Regular updates are not planned. Each tile reports its source files.',
    },
    licence: {
      name: 'Mixed open licences per source (public domain, CC BY 4.0, OGL, …)',
      url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      notes: 'Attribution to every contributing source is required.',
    },
    attribution: {
      short:
        'Terrain: Mapzen Terrain Tiles (AWS Open Data) — USGS, NOAA, NASA SRTM, Copernicus EU-DEM and national agencies',
      full: 'ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736; Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017; Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich; Canada terrain data contains information licensed under the Open Government Licence – Canada; Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration; Mexico terrain data source: INEGI, Continental relief, 2016; New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved); Norway terrain data © Kartverket; United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved; United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Hosted by the AWS Open Data Sponsorship Program; produced by Mapzen.',
    },
    rateLimits:
      'None published. Hosted on S3 under the AWS Open Data Sponsorship Program with no SLA.',
    caching: 'No Cache-Control header; browsers revalidate heuristically from Last-Modified.',
    limitations: [
      'No data beyond ±85.05° latitude; polar caps are filled flat for rendering and reported as no-data.',
      'Static 2017 product: does not reflect later landscape change.',
      'Voids and coastline seams where sources were merged; SRTM radar returns include vegetation and buildings.',
      'Vertical datum differs by source and is not harmonised.',
    ],
    status: 'integrated',
  },
  {
    id: 'eox-s2cloudless',
    name: 'Sentinel-2 cloudless 2025',
    organisation: 'EOX IT Services GmbH',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'EOxCloudless Sentinel-2 cloudless mosaic, 2025',
    description:
      'Global cloud-free true-colour mosaic composed from Copernicus Sentinel-2 acquisitions.',
    documentationUrl: 'https://cloudless.eox.at/documentation/usage',
    homepageUrl: 'https://cloudless.eox.at/',
    endpoint: {
      url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{y}/{x}.jpg',
      protocol: 'wmts-rest',
      format: 'JPEG, EPSG:4326, 256 px tiles',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: 'origin echoed' },
    coverage: {
      extent: 'global',
      description: 'Global land; oceans rendered from a lower-resolution background.',
    },
    resolution:
      '10 m (Sentinel-2 visible bands). Requests stop at level 14; deeper zoom is upsampled in the browser.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'periodic',
      description: 'Annual mosaic; individual pixels come from different 2025 acquisition dates.',
    },
    licence: {
      name: 'CC BY-NC-SA 4.0 (non-commercial); commercial use needs an EOX licence',
      url: 'https://cloudless.eox.at/documentation/license',
      notes:
        'Continuum is free, carries no advertising and no subscriptions. If that changes, this layer must be replaced or licensed.',
    },
    attribution: {
      short:
        'EOxCloudless 2025 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
      full: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
    },
    rateLimits: 'None published.',
    caching: 'Cache-Control: max-age=604800 (7 days).',
    limitations: ['Non-commercial licence.', 'Mosaic seams and colour balancing between scenes.'],
    status: 'integrated',
  },
  {
    ...gibsCommon,
    id: 'gibs-modis-terra',
    name: 'MODIS Terra true colour (daily)',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    description:
      'Daily global true-colour corrected reflectance from the MODIS instrument on NASA Terra.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
      protocol: 'wmts-rest',
      format: 'JPEG, EPSG:3857',
    },
    coverage: {
      extent: 'global',
      description: 'Daytime swaths; gaps between orbits near the equator; polar night excluded.',
    },
    resolution: '250 m',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: {
      kind: 'daily',
      description: 'Near-real-time daily composite of the selected UTC date, from 2000-02-24.',
    },
    attribution: {
      short: `${gibsAttribution} — MODIS Terra`,
      full: `${gibsAttribution}. MODIS Terra Corrected Reflectance (True Color).`,
    },
    caching: 'Cache-Control: no-store (daily layers are not cached by the browser).',
    limitations: [
      'Clouds are not removed.',
      'Orbit gaps appear as black wedges.',
      "Today's imagery may be incomplete until processing finishes.",
    ],
  },
  {
    ...gibsCommon,
    id: 'gibs-viirs-noaa20',
    name: 'VIIRS NOAA-20 true colour (daily)',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    description: 'Daily global true-colour corrected reflectance from VIIRS on NOAA-20.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
      protocol: 'wmts-rest',
      format: 'JPEG, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Daytime swaths with almost no equatorial gaps.' },
    resolution: '250 m (served on the Level9 matrix)',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: {
      kind: 'daily',
      description: 'Daily composite of the selected UTC date, from 2018-01-05.',
    },
    attribution: {
      short: `${gibsAttribution} — VIIRS NOAA-20`,
      full: `${gibsAttribution}. VIIRS NOAA-20 Corrected Reflectance (True Color).`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: ['Clouds are not removed.'],
  },
  {
    ...gibsCommon,
    id: 'gibs-blue-marble',
    name: 'Blue Marble shaded relief and bathymetry',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'BlueMarble_ShadedRelief_Bathymetry',
    description:
      'NASA Blue Marble cloud-free composite (2004) with shaded land relief and ocean bathymetry.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      protocol: 'wmts-rest',
      format: 'JPEG, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Global.' },
    resolution: '500 m',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: { kind: 'static', description: 'Monthly composite, August 2004.' },
    attribution: {
      short: `${gibsAttribution} — Blue Marble`,
      full: `${gibsAttribution}. NASA Blue Marble: Shaded Relief and Bathymetry.`,
    },
    caching: 'Cache-Control: max-age=259200.',
    limitations: ['Visualisation only: the shading is an image, not elevation data.'],
  },
  {
    ...gibsCommon,
    id: 'gibs-black-marble',
    name: 'Black Marble night lights (2016)',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'VIIRS_Black_Marble',
    description: 'Cloud-free composite of Earth at night from VIIRS day/night band.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Global.' },
    resolution: '500 m',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: { kind: 'static', description: 'Annual composite for 2016.' },
    attribution: {
      short: `${gibsAttribution} — Black Marble 2016`,
      full: `${gibsAttribution}. VIIRS Black Marble 2016.`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: [],
  },
  {
    id: 'usgs-imagery',
    name: 'USGS National Map orthoimagery',
    organisation: 'U.S. Geological Survey — The National Map',
    category: 'imagery',
    capabilities: ['imagery-tiles'],
    dataset: 'USGSImageryOnly (NAIP and other orthoimagery)',
    description: 'High-resolution orthoimagery for the United States.',
    documentationUrl: 'https://apps.nationalmap.gov/services/',
    homepageUrl: 'https://www.usgs.gov/programs/national-geospatial-program/national-map',
    endpoint: {
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      protocol: 'xyz',
      format: 'JPEG, EPSG:3857',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'regional',
      description: 'United States and territories; global low-resolution background elsewhere.',
    },
    resolution: 'Up to ~1 m (NAIP) in the US.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: { kind: 'periodic', description: 'Mixed acquisition dates by state.' },
    licence: {
      name: 'Public domain (U.S. Government work)',
      url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    },
    attribution: {
      short: 'Imagery: USGS The National Map',
      full: 'USGS The National Map: Orthoimagery. Data refreshed by state.',
    },
    rateLimits: 'None published.',
    caching: 'Cache-Control: max-age=86400.',
    limitations: ['Only meaningful inside the United States.'],
    status: 'integrated',
  },
  {
    ...openFreeMapCommon,
    id: 'openfreemap-boundaries',
    capabilities: ['vector-tiles'],
    name: 'Administrative borders (OpenFreeMap)',
    category: 'geography',
    dataset: 'OpenMapTiles "boundary" layer, planet extract',
    description:
      'Country, state and district borders from OpenStreetMap, drawn sharp at every zoom over the imagery.',
    documentationUrl: 'https://openmaptiles.org/schema/#boundary',
    coverage: {
      extent: 'global',
      description:
        'Countries (admin_level 2) everywhere; states (3–4) and districts with their subdivisions (5–6, meaning varies by country) where each zoom’s tiles carry them. Over Kerala, districts are absent at zoom 8 and present at zoom 10.',
    },
    resolution:
      'Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it.',
    limitations: [
      'Borders are as mapped in OpenStreetMap; disputed borders (flagged in the data) are drawn dashed. Maritime limits are not drawn.',
      'OpenStreetMap documents no positional accuracy for boundaries, so none is shown.',
      'Drawn into imagery tiles on the terrain: lines foreshorten when the view is tilted.',
    ],
  },
  {
    ...openFreeMapCommon,
    id: 'openfreemap-places',
    capabilities: ['vector-tiles'],
    name: 'Place names and points of interest (OpenFreeMap)',
    category: 'geography',
    dataset:
      'OpenMapTiles "place", "poi", "mountain_peak", "aerodrome_label" and "housenumber" layers, planet extract',
    description:
      'Country, state, city, town, village and neighbourhood names; airports and peaks (with height) from regional views; stations, hospitals, places of worship, schools, civic buildings, parks and shops close up; house numbers at street level. All chosen for each zoom and decluttered together.',
    documentationUrl: 'https://openmaptiles.org/schema/#poi',
    coverage: {
      extent: 'global',
      description:
        'As mapped in OpenStreetMap. Points of interest are in the zoom-14 tiles, so they appear from about 1:30 000: a central Chennai tile holds 1 486 points (875 named) and 63 house numbers, a central Madurai tile 506 points (checked 2026-11-01).',
    },
    resolution:
      'Point positions quantised to 4096 units per tile at each zoom (~0.6 m at the equator at zoom 14).',
    limitations: [
      'English names (name:en) where mapped, otherwise the local name.',
      'Gates, entrances, toilets, shelters, ATMs, parking and bus stops are left out: they outnumber everything else in a city (448 of the 1 486 points in the Chennai tile were gates).',
      'House numbers are sparse where OpenStreetMap has few addresses, which includes most of India.',
      'Labels are drawn into imagery tiles: they are not searchable or selectable, and a name can be cut where tiles of different zoom meet.',
    ],
  },
  {
    ...gibsCommon,
    id: 'gibs-coastlines',
    name: 'Coastlines',
    category: 'geography',
    capabilities: ['imagery-tiles'],
    dataset: 'Coastlines_15m',
    description: 'Coastline outlines rendered by GIBS from OpenStreetMap data.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Coastlines_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG overlay, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Global.' },
    resolution: 'Rendered to zoom 13.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: { kind: 'static', description: 'Static.' },
    licence: {
      name: 'ODbL (OpenStreetMap data); NASA rendering',
      url: 'https://www.openstreetmap.org/copyright',
    },
    attribution: {
      short: '© OpenStreetMap contributors, rendered by NASA GIBS',
      full: 'Coastlines © OpenStreetMap contributors (ODbL), rendered by NASA GIBS.',
    },
    caching: 'Static tiles.',
    limitations: [],
  },
  {
    ...gibsCommon,
    id: 'gibs-surface-water',
    name: 'Dynamic surface water (OPERA DSWx-HLS)',
    category: 'hydrology',
    capabilities: ['imagery-tiles'],
    dataset: 'OPERA_L3_Dynamic_Surface_Water_Extent-HLS',
    description:
      'Surface water extent classified from Harmonized Landsat and Sentinel-2 scenes (NASA JPL OPERA).',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OPERA_L3_Dynamic_Surface_Water_Extent-HLS/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG overlay, EPSG:3857',
    },
    coverage: {
      extent: 'global',
      description:
        'Land, excluding Antarctica; only where an HLS scene was acquired on the selected date.',
    },
    resolution: '30 m',
    accuracy: {
      horizontal: null,
      vertical: null,
      reference: 'https://www.jpl.nasa.gov/go/opera/products/dswx-product-suite/',
    },
    temporal: {
      kind: 'daily',
      description: 'Per-scene, selected UTC date. Coverage on any one day is sparse.',
    },
    attribution: {
      short: `${gibsAttribution} — OPERA DSWx-HLS (NASA JPL)`,
      full: `${gibsAttribution}. OPERA Level-3 Dynamic Surface Water Extent from HLS, NASA JPL.`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: [
      'Sparse: most of the globe is empty on a given day.',
      'Published with a lag of several days; recent dates return no tiles (HTTP 404), which Continuum treats as "no data", not an error.',
    ],
  },
  {
    ...gibsCommon,
    id: 'gibs-flood',
    name: 'Flood (VIIRS, 1-day)',
    category: 'hydrology',
    capabilities: ['imagery-tiles'],
    dataset: 'VIIRS_Combined_Flood_1-Day',
    description: 'Daily flood-water detection from VIIRS (NASA LANCE).',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Combined_Flood_1-Day/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG overlay, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Global land, cloud-free observations only.' },
    resolution: '375 m',
    accuracy: { horizontal: null, vertical: null, reference: null },
    temporal: { kind: 'daily', description: 'Selected UTC date.' },
    attribution: {
      short: `${gibsAttribution} — VIIRS flood (LANCE)`,
      full: `${gibsAttribution}. VIIRS Combined Flood 1-Day, NASA LANCE.`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: [
      'Cloud shadow can be misclassified as water.',
      'Opaque classification: grey marks insufficient data (cloud or night), not dry land.',
    ],
  },
  {
    ...gibsCommon,
    id: 'gibs-precipitation',
    name: 'Precipitation rate (IMERG)',
    category: 'weather',
    capabilities: ['imagery-tiles'],
    dataset: 'IMERG_Precipitation_Rate',
    description: 'Global precipitation rate from the GPM IMERG multi-satellite product.',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG overlay, EPSG:3857',
    },
    coverage: { extent: 'global', description: '60°N–60°S (full), polar coverage partial.' },
    resolution: '0.1° (~10 km)',
    accuracy: { horizontal: null, vertical: null, reference: 'https://gpm.nasa.gov/data/imerg' },
    temporal: {
      kind: 'daily',
      description: 'Selected UTC date (GIBS default 30-minute product for that day).',
    },
    attribution: {
      short: `${gibsAttribution} — GPM IMERG`,
      full: `${gibsAttribution}. GPM IMERG Precipitation Rate.`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: ['Coarse resolution; visual layer only.'],
  },
  {
    ...gibsCommon,
    id: 'gibs-sst',
    name: 'Sea surface temperature (GHRSST MUR)',
    category: 'bathymetry',
    capabilities: ['imagery-tiles'],
    dataset: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    description: 'Multi-scale Ultra-high Resolution analysed sea surface temperature (JPL).',
    endpoint: {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
      protocol: 'wmts-rest',
      format: 'PNG overlay, EPSG:3857',
    },
    coverage: { extent: 'global', description: 'Global oceans.' },
    resolution: '0.01° (~1 km)',
    accuracy: {
      horizontal: null,
      vertical: null,
      reference: 'https://podaac.jpl.nasa.gov/MEaSUREs-MUR',
    },
    temporal: {
      kind: 'daily',
      description: 'Daily analysis; typically 1–2 days behind real time.',
    },
    attribution: {
      short: `${gibsAttribution} — GHRSST MUR (NASA JPL)`,
      full: `${gibsAttribution}. GHRSST Level 4 MUR Global Foundation Sea Surface Temperature Analysis.`,
    },
    caching: 'Cache-Control: no-store.',
    limitations: ['Analysed (interpolated) field, not a direct observation everywhere.'],
  },
  {
    id: 'gebco-2026',
    name: 'GEBCO 2026 bathymetry',
    organisation:
      'General Bathymetric Chart of the Oceans (GEBCO) — IHO / IOC-UNESCO, hosted by BODC',
    category: 'bathymetry',
    capabilities: ['imagery-tiles'],
    dataset: 'GEBCO_2026 Grid (GEBCO_LATEST_2 colour-shaded, GEBCO_LATEST shaded relief)',
    description:
      'Global terrain model for ocean and land at 15 arc-second intervals, visualised as a WMS image.',
    documentationUrl: 'https://www.gebco.net/data-products/gebco-web-services/web-map-service',
    homepageUrl: 'https://www.gebco.net/',
    endpoint: {
      url: 'https://wms.gebco.net/mapserv?',
      protocol: 'wms',
      format: 'PNG via WMS 1.1.1 GetMap, EPSG:4326',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: { extent: 'global', description: 'Global ocean and land.' },
    resolution:
      '15 arc-seconds (~460 m at the equator) grid; much of the seafloor is interpolated between sparse soundings.',
    accuracy: {
      horizontal: null,
      vertical: null,
      reference:
        'https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid — the Type Identifier (TID) grid records which cells are measured.',
    },
    verticalDatum:
      'GEBCO: source data were assembled as if relative to mean sea level (some shallow areas use other vertical datums); the grid "can be assumed to be relative to WGS84".',
    surfaceModel: 'Bathymetry and land/ice-surface elevation (a sub-ice variant exists)',
    temporal: { kind: 'static', description: 'Annual release; GEBCO_2026 published April 2026.' },
    licence: {
      name: 'Public domain (GEBCO Grid terms of use); attribution required',
      url: 'https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use',
      notes:
        'Not to be used for navigation or safety at sea; must not imply GEBCO, IHO or IOC endorsement.',
    },
    attribution: {
      short: 'Bathymetry: GEBCO Compilation Group (2026) GEBCO 2026 Grid',
      full: 'GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid — a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa',
    },
    rateLimits: 'None published.',
    caching: 'Cache-Control: max-age=2630000 (~30 days).',
    limitations: [
      'Imagery only: the WMS does not return depth values (GetFeatureInfo returns no results), so it is never used as a terrain mesh.',
      'Interpolated cells are visually indistinguishable from measured ones in this layer.',
      'Not for navigation (GEBCO terms of use).',
    ],
    status: 'integrated',
  },
  {
    ...openFreeMapCommon,
    id: 'openfreemap-water',
    capabilities: ['vector-tiles'],
    name: 'Lakes, rivers and canals (OpenFreeMap)',
    category: 'hydrology',
    dataset: 'OpenMapTiles "water", "waterway" and "water_name" layers, planet extract',
    description:
      'Lakes, reservoirs and tanks, rivers, canals, streams and drains, with their names, drawn for each zoom over the imagery. Seasonal (intermittent) water is drawn lighter and dashed.',
    documentationUrl: 'https://openmaptiles.org/schema/#water',
    coverage: {
      extent: 'global',
      description:
        'As mapped in OpenStreetMap; small water bodies are added as zoom increases. A zoom-10 tile over central Tamil Nadu holds 134 lakes and tanks; a zoom-12 tile near Madurai 55 lakes and 38 canals (checked 2026-11-01). The open sea is left to the imagery.',
    },
    resolution:
      'Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it.',
    limitations: [
      'Outlines are as mapped in OpenStreetMap, not the water present today: a tank mapped at its full extent is drawn so in the dry season.',
      'Line widths are a display choice by class and zoom, not the river width.',
    ],
  },
  {
    ...openFreeMapCommon,
    id: 'openfreemap-roads',
    capabilities: ['vector-tiles'],
    name: 'Roads and railways (OpenFreeMap)',
    category: 'geography',
    dataset: 'OpenMapTiles "transportation" and "transportation_name" layers, planet extract',
    description:
      'Roads from motorways to footpaths, railways and ferries, with street names, drawn for each zoom over the imagery.',
    documentationUrl: 'https://openmaptiles.org/schema/#transportation',
    coverage: {
      extent: 'global',
      description:
        'Roads as mapped in OpenStreetMap; the tiles add minor roads as zoom increases (service roads and paths at zoom 14).',
    },
    resolution:
      'Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it.',
    limitations: [
      'Road widths are a display choice by class and zoom, not the mapped carriageway width.',
      'A street name is placed along the longest straight stretch of its road in each tile, so curving streets may go unnamed.',
    ],
  },
  {
    id: 'overture-buildings',
    name: 'Building footprints (Overture Maps)',
    organisation:
      'Overture Maps Foundation, conflating OpenStreetMap, Google Open Buildings, Microsoft Global ML Building Footprints and other sources',
    category: 'buildings',
    capabilities: ['vector-tiles'],
    dataset: 'Overture "buildings" theme, PMTiles archive of the latest release',
    description:
      'Building outlines, mapped by people or detected from imagery by machine learning, drawn at neighbourhood scale.',
    documentationUrl: 'https://docs.overturemaps.org/examples/overture-tiles',
    homepageUrl: 'https://overturemaps.org/',
    endpoint: {
      url: 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/<release>/buildings.pmtiles',
      protocol: 'mvt',
      format: 'Mapbox Vector Tiles in a PMTiles archive, read with HTTP range requests',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description:
        'Global. Far denser than OpenStreetMap alone where machine-detected footprints exist: a zoom-14 tile over central Kochi holds 7 365 buildings (OpenStreetMap via OpenFreeMap: 37).',
    },
    resolution:
      'Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0.6 m at the equator); generalised at lower zooms.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'periodic',
      description:
        'Monthly releases; the latest is read from Overture’s STAC catalogue (stac.overturemaps.org) when the layer first loads.',
    },
    licence: {
      name: 'ODbL (theme); CC BY 4.0 for Google Open Buildings and Esri Community Maps contributions',
      url: 'https://docs.overturemaps.org/attribution/',
    },
    attribution: {
      short:
        'Buildings: Overture Maps Foundation, © OpenStreetMap contributors, Google Open Buildings, Microsoft',
      full: 'Buildings: Overture Maps Foundation (overturemaps.org). © OpenStreetMap contributors (ODbL); Google Open Buildings (CC BY 4.0); Microsoft Global ML Building Footprints (ODbL); Esri Community Maps contributors (CC BY 4.0).',
    },
    rateLimits: 'None published. Continuum keeps four range requests in flight at most.',
    caching: 'Amazon S3 object; tiles are kept decoded in memory for the session only.',
    limitations: [
      'Overture publishes these tiles for inspection, not as a production basemap, and removes older releases. If the release in use is withdrawn during a session, the layer shows nothing until reload.',
      'Footprints only: almost none carry a height (12 of 7 365 in central Kochi), so they are not extruded.',
      'Machine-detected outlines can be missing, merged or misplaced; each footprint’s source is in the data.',
      'Zoom-14 tiles reach ~2 MB in dense areas, so footprints load only at neighbourhood scale.',
    ],
    status: 'integrated',
  },
  {
    id: 'geostationary-clouds',
    name: 'Live clouds (geostationary infrared)',
    organisation: 'EUMETSAT (Meteosat, via EUMETView) and NASA ESDIS GIBS (GOES, Himawari)',
    category: 'weather',
    capabilities: ['imagery-tiles'],
    dataset:
      'IR 10.8 µm images from Meteosat 0° and Meteosat Indian Ocean (EUMETView WMS msg_fes:ir108, msg_iodc:ir108); Band 13 Clean Infrared from GOES-East, GOES-West and Himawari (GIBS)',
    description:
      'Clouds from five geostationary satellites, stitched by longitude and looped over the last four hours, hour by hour.',
    documentationUrl: 'https://view.eumetsat.int/',
    homepageUrl: 'https://www.eumetsat.int/',
    endpoint: {
      url: 'https://view.eumetsat.int/geoserver/wms; https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/',
      protocol: 'wms',
      format: 'PNG; EUMETView WMS GetMap and GIBS WMTS tiles, with a TIME dimension',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description:
        'All longitudes. Each longitude is drawn by the nearest satellite; imagery thins towards the poles, where geostationary views are oblique.',
    },
    resolution:
      'Infrared imagery of about 2–3 km at the sub-satellite point, coarser towards the edge of each view. GIBS tiles are requested to zoom 5; Meteosat to zoom 3 (~20 km pixels), resampled beyond, because EUMETView renders each request on demand (measured 2026-11-01: 1–15 s per tile for Meteosat Indian Ocean, ~22 s for Meteosat 0°).',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'near-real-time',
      description:
        'Hourly frames; the newest is the latest full hour at least 45 minutes ago, so frames are 45–105 minutes old. EUMETView publishes every 15 minutes and GIBS every 10.',
    },
    licence: {
      name: 'EUMETSAT data policy; NASA open data',
      url: 'https://www.eumetsat.int/eumetsat-streamlines-its-data-and-service-policy-make-more-data-free-charge',
      notes:
        'Since 15 January 2019 hourly Meteosat imagery is not subject to licensing, while 15-minute imagery is free three hours after sensing, so Continuum uses hourly frames only. NASA GIBS imagery has no use restrictions.',
    },
    attribution: {
      short: 'Clouds: © EUMETSAT (Meteosat); NASA GIBS (GOES, Himawari)',
      full: 'Live clouds: © EUMETSAT, Meteosat IR 10.8 µm via EUMETView. NASA ESDIS GIBS, GOES-East, GOES-West and Himawari Band 13 imagery.',
    },
    rateLimits:
      'None published. Continuum keeps six requests in flight at most and requests nothing deeper than zoom 5.',
    caching:
      'EUMETView sends Cache-Control: max-age=604800; frames are reused while they stay in the loop.',
    limitations: [
      'Opacity is a display rule on the infrared brightness temperature (clear at 0 °C, opaque at −40 °C), not a measured cloud fraction. Warm low cloud and fog are missed, and very cold ground can read as cloud.',
      'EUMETView publishes its infrared as greyscale without a scale. Its temperatures are fitted against Himawari where both see the same clouds (grey ≈ 70 − 3.2 × T °C, 67 424 pixel pairs over the Bay of Bengal, 2026-11-01).',
      'Neighbouring satellites see clouds from different angles and at slightly different times, so seams can show along the boundary longitudes.',
      'The loop shows real hourly frames, crossfaded; it does not interpolate motion between them.',
      'Shadows place cloud tops by temperature with the standard atmosphere (6.5 K per km), a model rather than a measured height; see docs/ACCURACY.md.',
      'On a first visit the older frames join the loop as they load, over a minute or more; Europe and Africa (Meteosat 0°) come last. EUMETView responses are cached by the browser for seven days.',
    ],
    status: 'integrated',
  },
  aerialPhotos({
    id: 'ign-orthophotos',
    name: 'Aerial photos of France (IGN)',
    organisation:
      'Institut national de l’information géographique et forestière (IGN), Géoplateforme',
    dataset: 'ORTHOIMAGERY.ORTHOPHOTOS (BD ORTHO)',
    description: 'National aerial orthophotography of metropolitan France.',
    documentationUrl: 'https://geoservices.ign.fr/services-web',
    homepageUrl: 'https://geoservices.ign.fr/',
    endpoint: {
      url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM',
      protocol: 'wmts-rest',
      format: 'JPEG tiles, EPSG:3857, zoom 0–19',
    },
    coverage: {
      extent: 'regional',
      description:
        'Metropolitan France. Tiles beyond France come back pure white and are drawn as no data.',
    },
    resolution: 'BD ORTHO is a 20 cm product; the service goes to zoom 19 (~0.2 m pixels at 46°N).',
    temporal: {
      kind: 'periodic',
      description:
        'Renewed department by department on IGN’s regular aerial survey cycle; dates vary by area.',
    },
    licence: {
      name: 'Licence Ouverte / Open Licence (Etalab)',
      url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
      notes: 'IGN public data has been under the Etalab open licence since 1 January 2021.',
    },
    attribution: {
      short: 'Aerial photos: IGN (Géoplateforme)',
      full: 'Orthophotos © IGN, Géoplateforme, Licence Ouverte (Etalab).',
    },
    limitations: ['Shown from regional zoom inwards only, over metropolitan France.'],
  }),
  aerialPhotos({
    id: 'pdok-luchtfoto',
    name: 'Aerial photos of the Netherlands (PDOK)',
    organisation: 'Beeldmateriaal Nederland, served by PDOK',
    dataset: 'Luchtfoto RGB, Actueel_orthoHR',
    description: 'National high-resolution aerial photography of the Netherlands, current year.',
    documentationUrl: 'https://www.pdok.nl/',
    homepageUrl: 'https://www.beeldmateriaal.nl/',
    endpoint: {
      url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
      protocol: 'wmts-rest',
      format: 'JPEG tiles, EPSG:3857, zoom 0–21',
    },
    coverage: {
      extent: 'regional',
      description:
        'The Netherlands. Tiles beyond it come back pure white and are drawn as no data.',
    },
    resolution: '8 cm in the web services (some areas captured at 5 cm).',
    temporal: {
      kind: 'periodic',
      description: 'Flown annually; "Actueel" is the most recent year.',
    },
    licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    attribution: {
      short: 'Aerial photos: Beeldmateriaal Nederland (PDOK)',
      full: 'Luchtfoto © Beeldmateriaal Nederland, via PDOK, CC BY 4.0.',
    },
    limitations: ['Shown from regional zoom inwards only, over the Netherlands.'],
  }),
  aerialPhotos({
    id: 'swisstopo-swissimage',
    name: 'Aerial photos of Switzerland (swisstopo SWISSIMAGE)',
    organisation: 'Federal Office of Topography swisstopo',
    dataset: 'ch.swisstopo.swissimage (current)',
    description: 'National aerial orthophoto mosaic of Switzerland.',
    documentationUrl: 'https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10',
    homepageUrl: 'https://www.swisstopo.admin.ch/',
    endpoint: {
      url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
      protocol: 'wmts-rest',
      format: 'JPEG tiles, EPSG:3857, zoom 0–20',
    },
    coverage: {
      extent: 'regional',
      description: 'Switzerland, with imagery a little beyond its borders.',
    },
    resolution: 'SWISSIMAGE 10 cm product; the service goes to zoom 20.',
    temporal: {
      kind: 'periodic',
      description: 'Renewed on swisstopo’s survey cycle; dates vary by area.',
    },
    licence: {
      name: 'swisstopo free geodata (OGD) terms',
      url: 'https://www.swisstopo.admin.ch/en/conditions-geodata',
      notes: 'Free use, including commercial, with the source credited.',
    },
    attribution: {
      short: 'Aerial photos: © swisstopo',
      full: 'SWISSIMAGE © Federal Office of Topography swisstopo.',
    },
    limitations: ['Shown from regional zoom inwards only, over Switzerland.'],
  }),
  aerialPhotos({
    id: 'basemap-at-orthofoto',
    name: 'Aerial photos of Austria (basemap.at)',
    organisation: 'basemap.at (Austrian federal states and partners)',
    dataset: 'bmaporthofoto30cm',
    description: 'Aerial orthophoto mosaic of Austria.',
    documentationUrl: 'https://basemap.at/en/',
    homepageUrl: 'https://basemap.at/en/',
    endpoint: {
      url: 'https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
      protocol: 'xyz',
      format: 'JPEG tiles, EPSG:3857, zoom 0–20',
    },
    coverage: {
      extent: 'regional',
      description: 'Austria. Tiles beyond it return 404 and are drawn as no data.',
    },
    resolution:
      'Not stated by the provider (the layer is named "30cm"); the service goes to zoom 20.',
    temporal: { kind: 'periodic', description: 'Not stated per area.' },
    licence: {
      name: 'CC BY 4.0 (Open Government Data Austria)',
      url: 'https://basemap.at/en/',
    },
    attribution: {
      short: 'Aerial photos: basemap.at',
      full: 'Data source: basemap.at (CC BY 4.0).',
    },
    limitations: ['Shown from regional zoom inwards only, over Austria.'],
  }),
  {
    ...openFreeMapCommon,
    id: 'openfreemap-buildings',
    capabilities: ['vector-tiles'],
    name: 'OpenStreetMap buildings (OpenFreeMap)',
    category: 'buildings',
    dataset: 'OpenMapTiles "building" layer, planet extract',
    description: 'Building footprints with rendered heights, extruded in 3D at city scale.',
    documentationUrl: 'https://openmaptiles.org/schema/#building',
    coverage: {
      extent: 'global',
      description:
        'Wherever OpenStreetMap contributors have mapped buildings; completeness varies widely.',
    },
    resolution:
      'Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0.6 m at the equator).',
    limitations: [
      'Heights come from OSM height or building:levels tags; where neither is mapped, the OpenMapTiles schema assigns a default, so many heights are estimates.',
      'Building bases are placed on the terrain at the footprint centroid.',
    ],
  },
  {
    id: 'usgs-earthquakes',
    name: 'USGS earthquakes',
    organisation: 'U.S. Geological Survey — Earthquake Hazards Program',
    category: 'earthquakes',
    capabilities: ['feature-feed'],
    dataset: 'ComCat real-time GeoJSON summary feeds',
    description: 'Earthquakes worldwide reported by the USGS and contributing networks.',
    documentationUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    homepageUrl: 'https://earthquake.usgs.gov/earthquakes/feed/',
    endpoint: {
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{threshold}_{window}.geojson',
      protocol: 'geojson',
      format: 'GeoJSON FeatureCollection',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description: 'Global for M4.5+; denser and more complete in the United States.',
    },
    resolution: 'Point hypocentres.',
    accuracy: {
      horizontal:
        'Per event (horizontalError in the detail feed); typically km-scale outside dense networks.',
      vertical: 'Per event (depthError); depths are often fixed by the solution.',
      reference: 'https://earthquake.usgs.gov/data/comcat/data-eventterms.php',
    },
    verticalDatum:
      'Depth in km. NEIC references depths to the WGS84 geoid; other contributing networks may use mean sea level or average station elevation (USGS FAQ: https://www.usgs.gov/faqs/what-reference-datum-used-earthquake-depths).',
    temporal: {
      kind: 'near-real-time',
      description: 'Feeds regenerate every minute. Events are revised after publication.',
    },
    licence: {
      name: 'Public domain (U.S. Government work)',
      url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    },
    attribution: {
      short: 'Earthquakes: USGS',
      full: 'Earthquake data courtesy of the U.S. Geological Survey.',
    },
    rateLimits: 'None published; feeds are cached for 60 s and Continuum polls no faster.',
    caching: 'Cache-Control: public, max-age=60.',
    limitations: [
      'Automatic solutions are revised; magnitudes of different types (ml, mb, Mw) are not directly comparable.',
    ],
    status: 'integrated',
  },
  {
    id: 'nasa-eonet',
    name: 'NASA EONET natural events',
    organisation: 'NASA Earth Observatory Natural Event Tracker',
    category: 'natural-events',
    capabilities: ['feature-feed'],
    dataset: 'EONET v3 events',
    description:
      'Curated natural events — wildfires, severe storms, volcanoes, sea and lake ice, floods — linked to their sources.',
    documentationUrl: 'https://eonet.gsfc.nasa.gov/docs/v3',
    homepageUrl: 'https://eonet.gsfc.nasa.gov/',
    endpoint: {
      url: 'https://eonet.gsfc.nasa.gov/api/v3/events',
      protocol: 'json-rest',
      format: 'JSON',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description: 'Global; inclusion depends on the contributing sources.',
    },
    resolution: 'Points, tracks and polygons as supplied by each source.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'near-real-time',
      description:
        'Updated as sources report. Geometry dates default to 00:00Z when the source gives no time.',
    },
    licence: {
      name: 'NASA open data; individual sources keep their own terms',
      url: 'https://eonet.gsfc.nasa.gov/docs/v3',
    },
    attribution: {
      short: 'Natural events: NASA EONET',
      full: 'NASA Earth Observatory Natural Event Tracker (EONET) and its linked sources.',
    },
    rateLimits: 'x-ratelimit-limit: 60 per window (observed header).',
    caching: 'Cache-Control: no-cache.',
    limitations: [
      'An index of events, not an authoritative hazard warning service.',
      '"closed" dates may not mark the true end of an event.',
    ],
    status: 'integrated',
  },
  {
    id: 'open-meteo-elevation',
    name: 'Copernicus DEM GLO-90 (via Open-Meteo)',
    organisation: 'Open-Meteo, serving the Copernicus DEM (ESA / Airbus)',
    category: 'elevation',
    capabilities: ['point-elevation'],
    dataset: 'Copernicus DEM 2021 release, GLO-90',
    description: 'Point elevations from the Copernicus global digital surface model.',
    documentationUrl: 'https://open-meteo.com/en/docs/elevation-api',
    homepageUrl: 'https://open-meteo.com/',
    endpoint: {
      url: 'https://api.open-meteo.com/v1/elevation',
      protocol: 'json-rest',
      format: 'JSON',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: { extent: 'global', description: 'Global land.' },
    resolution: '90 m (3 arc-seconds)',
    accuracy: {
      horizontal: null,
      vertical:
        'Copernicus DEM specification: < 4 m absolute vertical accuracy (90% linear error) for GLO-30; GLO-90 is derived from it. Open-Meteo does not restate it.',
      reference: 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model',
    },
    verticalDatum: 'EGM2008 geoid (Copernicus DEM); Open-Meteo does not state its handling.',
    surfaceModel: 'DSM — includes buildings and forest canopy.',
    temporal: { kind: 'static', description: 'TanDEM-X acquisitions 2011–2015.' },
    licence: {
      name: 'Open-Meteo free API: non-commercial use; data CC BY 4.0',
      url: 'https://open-meteo.com/en/terms',
      notes:
        'Free tier allows < 10 000 calls/day per application. Continuum calls it once per inspection.',
    },
    attribution: {
      short: 'Elevation: Copernicus DEM GLO-90 via Open-Meteo',
      full: 'Copernicus DEM GLO-90 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; served by Open-Meteo.com (CC BY 4.0).',
    },
    rateLimits: '< 600/min, 5 000/h, 10 000/day (free tier).',
    caching: 'No caching headers.',
    limitations: [
      'Non-commercial free tier.',
      'Surface model: rooftops and canopy, not bare ground.',
    ],
    status: 'integrated',
  },
  {
    id: 'usgs-epqs',
    name: 'USGS 3DEP point query (EPQS)',
    organisation: 'U.S. Geological Survey — 3D Elevation Program',
    category: 'elevation',
    capabilities: ['point-elevation'],
    dataset: '3DEP best-available DEM (1 m – 1/3 arc-second)',
    description: 'Bare-earth elevation at a point from the best available 3DEP layer.',
    documentationUrl: 'https://epqs.nationalmap.gov/v1/docs',
    homepageUrl: 'https://www.usgs.gov/3d-elevation-program',
    endpoint: {
      url: 'https://epqs.nationalmap.gov/v1/json',
      protocol: 'json-rest',
      format: 'JSON',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: { extent: 'regional', description: 'United States, Puerto Rico and territories.' },
    resolution: 'Reported per query (1 m where lidar-derived, otherwise 1/3 or 1 arc-second).',
    accuracy: {
      horizontal: null,
      vertical:
        '3DEP lidar Quality Level 2: ≤ 10 cm RMSEz (non-vegetated) for the source lidar; the DEM product is not restated per point.',
      reference: 'https://www.usgs.gov/3d-elevation-program/about-3dep-products-services',
    },
    verticalDatum: 'NAVD88 (CONUS); local datums in territories.',
    surfaceModel: 'DTM — bare earth.',
    temporal: { kind: 'periodic', description: 'Acquisition date returned with each point.' },
    licence: {
      name: 'Public domain (U.S. Government work)',
      url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    },
    attribution: {
      short: 'Elevation: USGS 3DEP',
      full: 'Elevation courtesy of the U.S. Geological Survey 3D Elevation Program.',
    },
    rateLimits: 'None published. Responses were observed to take up to ~18 s.',
    caching: 'No caching headers.',
    limitations: ['US only; slow.'],
    status: 'integrated',
  },
  {
    id: 'noaa-ncei-dem',
    name: 'NOAA NCEI DEM global mosaic',
    organisation: 'NOAA National Centers for Environmental Information',
    category: 'bathymetry',
    capabilities: ['point-elevation'],
    dataset: 'DEM_mosaics/DEM_global_mosaic ImageServer (NCEI DEMs over a global base)',
    description:
      'Point elevation and depth from NOAA’s mosaic of coastal, regional and global DEMs.',
    documentationUrl: 'https://www.ncei.noaa.gov/products/coastal-elevation-models',
    homepageUrl:
      'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer',
    endpoint: {
      url: 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify',
      protocol: 'json-rest',
      format: 'ArcGIS ImageServer identify (JSON)',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description: 'Global, with high-resolution coastal DEMs mainly around the United States.',
    },
    resolution:
      'Varies by contributing DEM; the service reports its catalogue item but not a resolution per point.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: 'Varies by contributing DEM; not reported by the service per point.',
    surfaceModel: 'Integrated topography–bathymetry.',
    temporal: { kind: 'static', description: 'Mosaic of DEMs with differing build dates.' },
    licence: {
      name: 'Public domain (U.S. Government work)',
      url: 'https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso',
    },
    attribution: {
      short: 'Bathymetry: NOAA NCEI',
      full: 'Elevation and bathymetry courtesy of NOAA National Centers for Environmental Information.',
    },
    rateLimits: 'None published.',
    caching: 'No caching headers.',
    limitations: ['Vertical datum and resolution are not reported per point.'],
    status: 'integrated',
  },
  {
    id: 'open-meteo-weather',
    name: 'Current weather (Open-Meteo)',
    organisation: 'Open-Meteo, from national weather service models',
    category: 'weather',
    capabilities: ['point-weather'],
    dataset: 'Open-Meteo Forecast API, "best match" model blend',
    description: 'Current modelled conditions at a selected point.',
    documentationUrl: 'https://open-meteo.com/en/docs',
    homepageUrl: 'https://open-meteo.com/',
    endpoint: {
      url: 'https://api.open-meteo.com/v1/forecast',
      protocol: 'json-rest',
      format: 'JSON',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: { extent: 'global', description: 'Global.' },
    resolution: 'Model grid: ~1–11 km depending on region and model.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'near-real-time',
      description: 'Model output for the current 15-minute interval; not an observation.',
    },
    licence: {
      name: 'Open-Meteo free API: non-commercial use; data CC BY 4.0',
      url: 'https://open-meteo.com/en/terms',
    },
    attribution: {
      short: 'Weather: Open-Meteo.com',
      full: 'Weather data by Open-Meteo.com (CC BY 4.0), from national weather service models.',
    },
    rateLimits: '< 600/min, 5 000/h, 10 000/day (free tier).',
    caching: 'No caching headers.',
    limitations: ['Modelled values, not station observations.', 'Non-commercial free tier.'],
    status: 'integrated',
  },
  {
    id: 'osm-nominatim',
    name: 'Nominatim place search',
    organisation: 'OpenStreetMap Foundation',
    category: 'geocoding',
    capabilities: ['geocode'],
    dataset: 'OpenStreetMap',
    description: 'Search for places by name.',
    documentationUrl: 'https://nominatim.org/release-docs/latest/api/Search/',
    homepageUrl: 'https://nominatim.openstreetmap.org/',
    endpoint: {
      url: 'https://nominatim.openstreetmap.org/search',
      protocol: 'json-rest',
      format: 'JSON (jsonv2)',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: { extent: 'global', description: 'Global.' },
    resolution: 'Place centroids and bounding boxes.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'near-real-time',
      description: 'Follows OpenStreetMap edits within minutes to hours.',
    },
    licence: { name: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
    attribution: {
      short: 'Search: © OpenStreetMap contributors (Nominatim)',
      full: 'Search results © OpenStreetMap contributors, ODbL 1.0, via Nominatim.',
    },
    rateLimits:
      'Usage policy: at most 1 request per second; no autocomplete; identify via Referer.',
    caching: 'Continuum keeps recent results in memory for the session only.',
    limitations: [
      'Searches run only on explicit submit (no as-you-type), at most one per second, per the OSMF usage policy.',
      'Can be switched off in configuration without a code change if OSMF asks.',
    ],
    status: 'integrated',
  },
  {
    id: 'usgs-planetary-maps',
    name: 'Planetary maps (USGS Astrogeology)',
    organisation:
      'USGS Astrogeology Science Center, serving NASA mission mosaics (MESSENGER, Magellan, LRO, Viking, Cassini, New Horizons)',
    category: 'planetary',
    capabilities: ['planetary-map'],
    dataset:
      'Simple-cylindrical WMS layers: Mercury MESSENGER, Venus MAGELLAN_color, Moon LROC_WAC, Mars MDIM21_color, Jupiter CASSINI, Pluto NEWHORIZONS_PLUTO_MOSAIC',
    description:
      'One global map per body, wrapped round its sphere in space: grey MESSENGER Mercury, Magellan radar of Venus’s surface, the LRO wide-angle Moon, colourised Viking Mars, Cassini’s Jupiter and the New Horizons Pluto mosaic.',
    documentationUrl: 'https://planetarymaps.usgs.gov/',
    homepageUrl: 'https://astrogeology.usgs.gov/',
    endpoint: {
      url: 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/<body>/<body>_simp_cyl.map',
      protocol: 'wms',
      format: 'WMS 1.1.1 GetMap, EPSG:4326 (planetocentric, east-positive), JPEG',
    },
    authentication: 'none',
    cors: { verified: true, verifiedOn: VERIFIED, allowOrigin: '*' },
    coverage: {
      extent: 'global',
      description:
        'Whole bodies. Pluto’s mosaic is detailed only on the hemisphere New Horizons passed; the rest is coarse or blank.',
    },
    resolution:
      'Requested at 2 048 × 1 024 pixels per body (the Moon and Mars at 4 096 × 2 048 when close): about 5.3 km per pixel at the Moon’s equator and 2.6 km close up. The source mosaics are far finer (e.g. 100–232 m for Mars).',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: {
      kind: 'static',
      description:
        'Mission mosaics: Mercury 2016, Moon 2013, Pluto 2017, Viking 1970s, Cassini 2000.',
    },
    licence: {
      name: 'Public domain (U.S. Government and NASA mission data)',
      url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
      notes: 'Credit the missions and USGS.',
    },
    attribution: {
      short: 'Planetary maps: NASA, USGS Astrogeology',
      full: 'Planetary maps from NASA missions (MESSENGER, Magellan, LRO, Viking, Cassini, New Horizons) via the USGS Astrogeology planetary WMS.',
    },
    rateLimits: 'None published.',
    caching: 'No Cache-Control; each map is fetched once per session and held in memory.',
    limitations: [
      'Venus is shown by its radar-mapped surface; in visible light its clouds hide it.',
      'Mars’s colours are added to the Viking mosaic (NASA Ames), not measured.',
      'One texture per body: close up the detail is that of the texture, not of the source mosaic.',
      'No map is shown for Saturn, Uranus and Neptune (see Investigated, not integrated), nor for the Sun.',
    ],
    status: 'integrated',
  },
  {
    id: 'jpl-approximate-positions',
    name: 'Planet positions (JPL approximate elements)',
    organisation: 'NASA JPL Solar System Dynamics (E. M. Standish and J. G. Williams)',
    category: 'planetary',
    capabilities: ['ephemeris'],
    dataset:
      'Keplerian elements and rates, mean ecliptic and equinox of J2000: Table 1 (1800–2050), Tables 2a and 2b (3000 BC – AD 3000)',
    description:
      'Where Mercury to Neptune and the Earth–Moon barycentre are at any time, solved exactly as JPL describes, and the orbit lines they trace.',
    documentationUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    homepageUrl: 'https://ssd.jpl.nasa.gov/',
    endpoint: {
      url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      protocol: 'bundled',
      format: 'Published tables, compiled into the app',
    },
    authentication: 'none',
    cors: { verified: false, verifiedOn: VERIFIED, allowOrigin: 'not fetched' },
    coverage: { extent: 'global', description: 'Mercury to Neptune, 3000 BC – AD 3000.' },
    resolution: 'Analytical: positions at any instant.',
    accuracy: {
      horizontal:
        'JPL’s nominal heliocentric errors for 1800–2050: 10–600″ in longitude (Neptune smallest, Saturn largest), 1–25″ in latitude, 1 000–1 500 000 km in distance. Measured against JPL Horizons at four dates: within twice those, except Neptune at up to 45″ (its elements follow the barycentre); see docs/ACCURACY.md.',
      vertical: null,
      reference: 'ICRF (J2000 equatorial), via the J2000 ecliptic at obliquity 23.43928°',
    },
    verticalDatum: null,
    temporal: { kind: 'static', description: 'Fixed tables, evaluated for the clock’s time.' },
    licence: {
      name: 'NASA/JPL published data (no use restrictions stated)',
      url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    },
    attribution: {
      short: 'Positions: NASA JPL',
      full: 'Planet positions from JPL’s “Approximate Positions of the Planets” (E. M. Standish and J. G. Williams).',
    },
    rateLimits: 'Not applicable: nothing is fetched.',
    caching: 'Not applicable.',
    limitations: [
      'Geometric positions at the clock’s time, not corrected for light travel time.',
      'Pluto is not in these tables: see the Pluto elements entry.',
    ],
    status: 'integrated',
  },
  {
    id: 'jpl-horizons-pluto',
    name: 'Pluto orbital elements (JPL Horizons)',
    organisation: 'NASA JPL Solar System Dynamics',
    category: 'planetary',
    capabilities: ['ephemeris'],
    dataset:
      'Osculating heliocentric elements, ecliptic and equinox of J2000, at 2026-11-01 00:00 TDB',
    description: 'Pluto’s orbit, propagated as a two-body ellipse from one set of elements.',
    documentationUrl: 'https://ssd.jpl.nasa.gov/horizons/manual.html',
    homepageUrl: 'https://ssd.jpl.nasa.gov/horizons/',
    endpoint: {
      url: 'https://ssd.jpl.nasa.gov/api/horizons.api (EPHEM_TYPE=ELEMENTS, COMMAND=999)',
      protocol: 'bundled',
      format: 'Values compiled into the app',
    },
    authentication: 'none',
    cors: { verified: false, verifiedOn: VERIFIED, allowOrigin: 'not fetched' },
    coverage: { extent: 'global', description: 'Pluto.' },
    resolution: 'Analytical.',
    accuracy: {
      horizontal:
        'Measured against Horizons: exact at the element epoch, within 0.15° from 2000 to 2040, 4.6° in 1850.',
      vertical: null,
      reference: 'ICRF',
    },
    verticalDatum: null,
    temporal: { kind: 'static', description: 'One epoch; accuracy falls away from it.' },
    licence: {
      name: 'NASA/JPL published data (no use restrictions stated)',
      url: 'https://ssd.jpl.nasa.gov/horizons/',
    },
    attribution: { short: 'Pluto: JPL Horizons', full: 'Pluto’s elements from JPL Horizons.' },
    rateLimits: 'Not applicable: nothing is fetched.',
    caching: 'Not applicable.',
    limitations: ['A two-body orbit ignores Neptune’s pull, so it drifts over decades.'],
    status: 'integrated',
  },
  {
    id: 'naif-pck00011',
    name: 'Body sizes and rotation (IAU 2015, NAIF pck00011)',
    organisation:
      'IAU Working Group on Cartographic Coordinates and Rotational Elements; NASA NAIF',
    category: 'planetary',
    capabilities: ['ephemeris'],
    dataset: 'pck00011.tpc: pole, prime meridian and radii of the Sun and planets',
    description:
      'Which way each body points and how fast it turns, and its size: so the right face of Mars or Jupiter faces Earth at the clock’s time.',
    documentationUrl: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc',
    homepageUrl: 'https://naif.jpl.nasa.gov/',
    endpoint: {
      url: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc',
      protocol: 'bundled',
      format: 'SPICE text kernel, values compiled into the app',
    },
    authentication: 'none',
    cors: { verified: false, verifiedOn: VERIFIED, allowOrigin: 'not fetched' },
    coverage: { extent: 'global', description: 'The Sun, Mercury to Neptune, and Pluto.' },
    resolution: 'Analytical.',
    accuracy: {
      horizontal:
        'Sub-Earth points measured against JPL Horizons for all eight bodies: within 0.2° in longitude and latitude.',
      vertical: null,
      reference: 'ICRF; planetocentric, east-positive longitudes',
    },
    verticalDatum: null,
    temporal: { kind: 'static', description: 'IAU 2015 models (Archinal et al. 2018).' },
    licence: {
      name: 'NASA NAIF / IAU published constants (no use restrictions stated)',
      url: 'https://naif.jpl.nasa.gov/naif/rules.html',
    },
    attribution: {
      short: 'Rotation: IAU WGCCRE 2015 (NAIF)',
      full: 'Body orientations and radii from the IAU WGCCRE 2015 report, as published by NASA NAIF in pck00011.tpc.',
    },
    rateLimits: 'Not applicable: nothing is fetched.',
    caching: 'Not applicable.',
    limitations: [
      'Jupiter’s periodic pole terms (≤ 0.0022°) and Mercury’s libration (≤ 0.011°) are left out.',
      'Jupiter, Saturn, Uranus and Neptune turn at their System III (magnetic) rates; their clouds drift against them.',
    ],
    status: 'integrated',
  },
  {
    id: 'nasa-saturn-rings',
    name: 'Saturn’s rings (NASA fact sheet)',
    organisation: 'NASA Goddard Space Flight Center, NSSDCA',
    category: 'planetary',
    capabilities: ['ephemeris'],
    dataset:
      'Saturnian Rings Fact Sheet: radii, optical depth and albedo of the C, B, A and F rings',
    description: 'Saturn’s main rings, drawn to their published radii, opacity and brightness.',
    documentationUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html',
    homepageUrl: 'https://nssdc.gsfc.nasa.gov/',
    endpoint: {
      url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html',
      protocol: 'bundled',
      format: 'Values compiled into the app',
    },
    authentication: 'none',
    cors: { verified: false, verifiedOn: VERIFIED, allowOrigin: 'not fetched' },
    coverage: {
      extent: 'global',
      description: 'C, B and A rings, the Cassini Division and the F ring.',
    },
    resolution: 'Ring boundaries to the kilometre.',
    accuracy: { horizontal: null, vertical: null, reference: null },
    verticalDatum: null,
    temporal: { kind: 'static', description: 'Last updated by NASA on 19 April 2022.' },
    licence: {
      name: 'NASA public information',
      url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html',
    },
    attribution: {
      short: 'Saturn’s rings: NASA',
      full: 'Ring radii, optical depths and albedos from NASA’s Saturnian Rings Fact Sheet.',
    },
    rateLimits: 'Not applicable: nothing is fetched.',
    caching: 'Not applicable.',
    limitations: [
      'Opacity and brightness use the middle of each published range; ring colour is a display choice.',
      'The F ring is listed by its inner edge only (narrower than 1 000 km); it is drawn 500 km wide.',
      'Gaps narrower than 1 000 km and the shadows of the rings and planet are not drawn.',
    ],
    status: 'integrated',
  },
];

export function providerById(id: string): ProviderMetadata {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}

export function providersWith(
  capability: ProviderMetadata['capabilities'][number],
): ProviderMetadata[] {
  return PROVIDERS.filter(
    (p) => p.capabilities.includes(capability) && p.status !== 'future' && p.status !== 'rejected',
  );
}
