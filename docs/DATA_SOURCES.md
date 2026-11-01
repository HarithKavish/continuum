# Data sources

The provider catalogue: every source Continuum uses, what it is, how good it is, and on
what terms. Research behind these choices is in [RESEARCH.md](RESEARCH.md).

**Rules every entry satisfies**

- No login, no API key, no proxy. Every request goes from the reader's browser to the
  provider.
- Browser access was verified from a third-party origin with
  `node tools/probe-endpoints.mjs` (results: [research/probe-results.json](research/probe-results.json)).
- Accuracy, datum and resolution are quoted only where the provider documents them;
  otherwise "Not stated by the provider".
- Nothing fetched is persisted. Responses live in memory for the session; the browser's
  HTTP cache follows each provider's own headers.

**How to add a source:** metadata in `src/config/providers/catalog.ts` (and a layer
definition in `layers.ts` for tiles), an adapter in `src/providers/`, a probe line in
`tools/probe-endpoints.mjs`, then regenerate the section below with
`node --experimental-strip-types tools/build-data-sources.mjs`.

## Terrain Tiles source files

The terrain product merges many datasets. Each tile names its source files; what each
prefix means is in `src/config/providers/terrainSources.ts` and is shown by the inspector.

| Prefix | Dataset | Resolution | Model | Vertical datum |
|---|---|---|---|---|
| `srtm/` | NASA SRTM | 1″ (~30 m) | DSM-like (radar) | EGM96 |
| `gmted/` | USGS/NGA GMTED2010 | 7.5″ / 30″ | DEM | EGM96 |
| `etopo1/` | NOAA ETOPO1 **Bedrock** | 1′ (~1.85 km) | Topography + bathymetry, rock under ice | Sea level |
| `ned13/` | USGS 3DEP ⅓″ | ~10 m | DTM | NAVD88 |
| `ned/` | USGS 3DEP 1/9″, NED topobathy (CA) | ~3 m | DTM | NAVD88 |
| `eudem/` | Copernicus EU-DEM v1.0 | ~25 m | DSM | EVRS2000 |
| `austria/` | Austria DGM | 10 m | DTM | National |
| `uk_lidar/` | Environment Agency LIDAR | 2 m | DTM | ODN |
| `nrcan_cdem/` | NRCan CDEM | 20–400 m | DEM | CGVD28 |
| `kartverket/` | Kartverket DTM | 10 m | DTM | National |
| `nzlinz/` | LINZ 8 m DEM | 8 m | DEM | Not restated |
| `mx_lidar/` | INEGI continental relief | Not restated | DEM | Not restated |
| `pgdc_5m/` | ArcticDEM v2.0 | 5 m | DSM | **WGS84 ellipsoid** (converted by Continuum) |
| `geoscience_au/` | Geoscience Australia LiDAR | 5 m | DEM | AHD |

## Catalogue

Generated from `src/config/providers/` — edit there, then regenerate.

<!-- catalogue:start -->

| Provider | Category | Coverage | Resolution | Auth | CORS | Licence | Status |
|---|---|---|---|---|---|---|---|
| [Terrain Tiles (Terrarium)](#aws-terrain-tiles) | terrain | global | Varies by place and zoom: ~3 m (UK LIDAR) to 10 m (3DEP, EU national), 30 m (SRTM), 7 | none | verified 2026-11-01 | Mixed open licences per source (public domain, CC BY 4.0, OGL, …) | integrated |
| [Sentinel-2 cloudless 2025](#eox-s2cloudless) | imagery | global | 10 m (Sentinel-2 visible bands) | none | verified 2026-11-01 | CC BY-NC-SA 4.0 (non-commercial); commercial use needs an EOX licence | integrated |
| [MODIS Terra true colour (daily)](#gibs-modis-terra) | imagery | global | 250 m | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [VIIRS NOAA-20 true colour (daily)](#gibs-viirs-noaa20) | imagery | global | 250 m (served on the Level9 matrix) | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [Blue Marble shaded relief and bathymetry](#gibs-blue-marble) | imagery | global | 500 m | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [Black Marble night lights (2016)](#gibs-black-marble) | imagery | global | 500 m | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [USGS National Map orthoimagery](#usgs-imagery) | imagery | regional | Up to ~1 m (NAIP) in the US | none | verified 2026-11-01 | Public domain (U.S. Government work) | integrated |
| [Administrative borders (OpenFreeMap)](#openfreemap-boundaries) | geography | global | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0 | none | verified 2026-11-01 | ODbL (data); OpenMapTiles schema (BSD/CC-BY) | integrated |
| [Place names and points of interest (OpenFreeMap)](#openfreemap-places) | geography | global | Point positions quantised to 4096 units per tile at each zoom (~0 | none | verified 2026-11-01 | ODbL (data); OpenMapTiles schema (BSD/CC-BY) | integrated |
| [Coastlines](#gibs-coastlines) | geography | global | Rendered to zoom 13 | none | verified 2026-11-01 | ODbL (OpenStreetMap data); NASA rendering | integrated |
| [Dynamic surface water (OPERA DSWx-HLS)](#gibs-surface-water) | hydrology | global | 30 m | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [Flood (VIIRS, 1-day)](#gibs-flood) | hydrology | global | 375 m | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [Precipitation rate (IMERG)](#gibs-precipitation) | weather | global | 0 | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [Sea surface temperature (GHRSST MUR)](#gibs-sst) | bathymetry | global | 0 | none | verified 2026-11-01 | NASA open data (no use restrictions) | integrated |
| [GEBCO 2026 bathymetry](#gebco-2026) | bathymetry | global | 15 arc-seconds (~460 m at the equator) grid; much of the seafloor is interpolated between sparse soundings | none | verified 2026-11-01 | Public domain (GEBCO Grid terms of use); attribution required | integrated |
| [Lakes, rivers and canals (OpenFreeMap)](#openfreemap-water) | hydrology | global | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0 | none | verified 2026-11-01 | ODbL (data); OpenMapTiles schema (BSD/CC-BY) | integrated |
| [Roads and railways (OpenFreeMap)](#openfreemap-roads) | geography | global | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0 | none | verified 2026-11-01 | ODbL (data); OpenMapTiles schema (BSD/CC-BY) | integrated |
| [Building footprints (Overture Maps)](#overture-buildings) | buildings | global | Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0 | none | verified 2026-11-01 | ODbL (theme); CC BY 4.0 for Google Open Buildings and Esri Community Maps contributions | integrated |
| [Live clouds (geostationary infrared)](#geostationary-clouds) | weather | global | Infrared imagery of about 2–3 km at the sub-satellite point, coarser towards the edge of each view | none | verified 2026-11-01 | EUMETSAT data policy; NASA open data | integrated |
| [Aerial photos of France (IGN)](#ign-orthophotos) | imagery | regional | BD ORTHO is a 20 cm product; the service goes to zoom 19 (~0 | none | verified 2026-11-01 | Licence Ouverte / Open Licence (Etalab) | integrated |
| [Aerial photos of the Netherlands (PDOK)](#pdok-luchtfoto) | imagery | regional | 8 cm in the web services (some areas captured at 5 cm) | none | verified 2026-11-01 | CC BY 4.0 | integrated |
| [Aerial photos of Switzerland (swisstopo SWISSIMAGE)](#swisstopo-swissimage) | imagery | regional | SWISSIMAGE 10 cm product; the service goes to zoom 20 | none | verified 2026-11-01 | swisstopo free geodata (OGD) terms | integrated |
| [Aerial photos of Austria (basemap.at)](#basemap-at-orthofoto) | imagery | regional | Not stated by the provider (the layer is named "30cm"); the service goes to zoom 20 | none | verified 2026-11-01 | CC BY 4.0 (Open Government Data Austria) | integrated |
| [OpenStreetMap buildings (OpenFreeMap)](#openfreemap-buildings) | buildings | global | Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0 | none | verified 2026-11-01 | ODbL (data); OpenMapTiles schema (BSD/CC-BY) | integrated |
| [USGS earthquakes](#usgs-earthquakes) | earthquakes | global | Point hypocentres | none | verified 2026-11-01 | Public domain (U.S. Government work) | integrated |
| [NASA EONET natural events](#nasa-eonet) | natural-events | global | Points, tracks and polygons as supplied by each source | none | verified 2026-11-01 | NASA open data; individual sources keep their own terms | integrated |
| [Copernicus DEM GLO-90 (via Open-Meteo)](#open-meteo-elevation) | elevation | global | 90 m (3 arc-seconds) | none | verified 2026-11-01 | Open-Meteo free API: non-commercial use; data CC BY 4.0 | integrated |
| [USGS 3DEP point query (EPQS)](#usgs-epqs) | elevation | regional | Reported per query (1 m where lidar-derived, otherwise 1/3 or 1 arc-second) | none | verified 2026-11-01 | Public domain (U.S. Government work) | integrated |
| [NOAA NCEI DEM global mosaic](#noaa-ncei-dem) | bathymetry | global | Varies by contributing DEM; the service reports its catalogue item but not a resolution per point | none | verified 2026-11-01 | Public domain (U.S. Government work) | integrated |
| [Current weather (Open-Meteo)](#open-meteo-weather) | weather | global | Model grid: ~1–11 km depending on region and model | none | verified 2026-11-01 | Open-Meteo free API: non-commercial use; data CC BY 4.0 | integrated |
| [Nominatim place search](#osm-nominatim) | geocoding | global | Place centroids and bounding boxes | none | verified 2026-11-01 | ODbL 1.0 | integrated |

### Terrain Tiles (Terrarium)

<a id="aws-terrain-tiles"></a>

| | |
|---|---|
| Provider | Mapzen / Tilezen (Linux Foundation), hosted on the AWS Open Data Registry |
| Dataset | Joerd composite global DEM, Terrarium PNG encoding, v1.1 (2017) |
| Description | Global elevation and bathymetry merged from SRTM, GMTED2010, ETOPO1, USGS 3DEP and national datasets, tiled on the Web Mercator grid to zoom 15. |
| Documentation | https://github.com/tilezen/joerd/tree/master/docs |
| Endpoint | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (xyz; PNG, height = (R·256 + G + B/256) − 32768 m) |
| Capabilities | terrain-heightmap, point-elevation |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Web Mercator extent (±85.05° latitude). Land from SRTM (60°N–56°S), 3DEP (US), ArcticDEM and national DEMs; oceans from ETOPO1. |
| Resolution | Varies by place and zoom: ~3 m (UK LIDAR) to 10 m (3DEP, EU national), 30 m (SRTM), 7.5″–30″ (GMTED2010), 1′ (ETOPO1 oceans). Tile grid at z15 ≈ 4.8 m × cos(latitude). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | https://github.com/tilezen/joerd/blob/master/docs/data-sources.md |
| Vertical datum | Not harmonised by the producer. Inherited from each source: EGM96 geoid (SRTM, GMTED2010), NAVD88 (USGS 3DEP), mean sea level (ETOPO1). |
| Surface model | Mixed. SRTM is a radar surface model (DSM-like); 3DEP and the national LIDAR products are bare-earth DTMs; ETOPO1 is bathymetry/topography. |
| Updates | static: Built 2016 (v1) and 2017 (v1.1). Regular updates are not planned. Each tile reports its source files. |
| Rate limits | None published. Hosted on S3 under the AWS Open Data Sponsorship Program with no SLA. |
| Caching | No Cache-Control header; browsers revalidate heuristically from Last-Modified. |
| Licence | [Mixed open licences per source (public domain, CC BY 4.0, OGL, …)](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) — Attribution to every contributing source is required. |
| Attribution | ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736; Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017; Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich; Canada terrain data contains information licensed under the Open Government Licence – Canada; Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers; Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration; Mexico terrain data source: INEGI, Continental relief, 2016; New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved); Norway terrain data © Kartverket; United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved; United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Hosted by the AWS Open Data Sponsorship Program; produced by Mapzen. |
| Limitations | No data beyond ±85.05° latitude; polar caps are filled flat for rendering and reported as no-data. Static 2017 product: does not reflect later landscape change. Voids and coastline seams where sources were merged; SRTM radar returns include vegetation and buildings. Vertical datum differs by source and is not harmonised. |
| Status | integrated |

### Sentinel-2 cloudless 2025

<a id="eox-s2cloudless"></a>

| | |
|---|---|
| Provider | EOX IT Services GmbH |
| Dataset | EOxCloudless Sentinel-2 cloudless mosaic, 2025 |
| Description | Global cloud-free true-colour mosaic composed from Copernicus Sentinel-2 acquisitions. |
| Documentation | https://cloudless.eox.at/documentation/usage |
| Endpoint | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/{z}/{y}/{x}.jpg` (wmts-rest; JPEG, EPSG:4326, 256 px tiles) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: origin echoed |
| Coverage | Global land; oceans rendered from a lower-resolution background. |
| Resolution | 10 m (Sentinel-2 visible bands). Requests stop at level 14; deeper zoom is upsampled in the browser. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Annual mosaic; individual pixels come from different 2025 acquisition dates. |
| Rate limits | None published. |
| Caching | Cache-Control: max-age=604800 (7 days). |
| Licence | [CC BY-NC-SA 4.0 (non-commercial); commercial use needs an EOX licence](https://cloudless.eox.at/documentation/license) — Continuum is free, carries no advertising and no subscriptions. If that changes, this layer must be replaced or licensed. |
| Attribution | EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025) |
| Limitations | Non-commercial licence. Mosaic seams and colour balancing between scenes. |
| Status | integrated |

### MODIS Terra true colour (daily)

<a id="gibs-modis-terra"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | MODIS_Terra_CorrectedReflectance_TrueColor |
| Description | Daily global true-colour corrected reflectance from the MODIS instrument on NASA Terra. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` (wmts-rest; JPEG, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Daytime swaths; gaps between orbits near the equator; polar night excluded. |
| Resolution | 250 m |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Near-real-time daily composite of the selected UTC date, from 2000-02-24. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store (daily layers are not cached by the browser). |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. MODIS Terra Corrected Reflectance (True Color). |
| Limitations | Clouds are not removed. Orbit gaps appear as black wedges. Today's imagery may be incomplete until processing finishes. |
| Status | integrated |

### VIIRS NOAA-20 true colour (daily)

<a id="gibs-viirs-noaa20"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | VIIRS_NOAA20_CorrectedReflectance_TrueColor |
| Description | Daily global true-colour corrected reflectance from VIIRS on NOAA-20. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` (wmts-rest; JPEG, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Daytime swaths with almost no equatorial gaps. |
| Resolution | 250 m (served on the Level9 matrix) |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Daily composite of the selected UTC date, from 2018-01-05. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. VIIRS NOAA-20 Corrected Reflectance (True Color). |
| Limitations | Clouds are not removed. |
| Status | integrated |

### Blue Marble shaded relief and bathymetry

<a id="gibs-blue-marble"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | BlueMarble_ShadedRelief_Bathymetry |
| Description | NASA Blue Marble cloud-free composite (2004) with shaded land relief and ocean bathymetry. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg` (wmts-rest; JPEG, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. |
| Resolution | 500 m |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | static: Monthly composite, August 2004. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: max-age=259200. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. NASA Blue Marble: Shaded Relief and Bathymetry. |
| Limitations | Visualisation only: the shading is an image, not elevation data. |
| Status | integrated |

### Black Marble night lights (2016)

<a id="gibs-black-marble"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | VIIRS_Black_Marble |
| Description | Cloud-free composite of Earth at night from VIIRS day/night band. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png` (wmts-rest; PNG, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. |
| Resolution | 500 m |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | static: Annual composite for 2016. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. VIIRS Black Marble 2016. |
| Limitations | None recorded |
| Status | integrated |

### USGS National Map orthoimagery

<a id="usgs-imagery"></a>

| | |
|---|---|
| Provider | U.S. Geological Survey — The National Map |
| Dataset | USGSImageryOnly (NAIP and other orthoimagery) |
| Description | High-resolution orthoimagery for the United States. |
| Documentation | https://apps.nationalmap.gov/services/ |
| Endpoint | `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}` (xyz; JPEG, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | United States and territories; global low-resolution background elsewhere. |
| Resolution | Up to ~1 m (NAIP) in the US. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Mixed acquisition dates by state. |
| Rate limits | None published. |
| Caching | Cache-Control: max-age=86400. |
| Licence | [Public domain (U.S. Government work)](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) |
| Attribution | USGS The National Map: Orthoimagery. Data refreshed by state. |
| Limitations | Only meaningful inside the United States. |
| Status | integrated |

### Administrative borders (OpenFreeMap)

<a id="openfreemap-boundaries"></a>

| | |
|---|---|
| Provider | OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data |
| Dataset | OpenMapTiles "boundary" layer, planet extract |
| Description | Country, state and district borders from OpenStreetMap, drawn sharp at every zoom over the imagery. |
| Documentation | https://openmaptiles.org/schema/#boundary |
| Endpoint | `https://tiles.openfreemap.org/planet` (mvt; Mapbox Vector Tiles via TileJSON) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Countries (admin_level 2) everywhere; states (3–4) and districts with their subdivisions (5–6, meaning varies by country) where each zoom’s tiles carry them. Over Kerala, districts are absent at zoom 8 and present at zoom 10. |
| Resolution | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Planet rebuilt regularly; the active build date is reported in the TileJSON URL. |
| Rate limits | No limits on map views; please keep request volume reasonable. |
| Caching | Cache-Control on tiles from the provider; TileJSON max-age=3600. |
| Licence | [ODbL (data); OpenMapTiles schema (BSD/CC-BY)](https://www.openstreetmap.org/copyright) |
| Attribution | OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL). |
| Limitations | Borders are as mapped in OpenStreetMap; disputed borders (flagged in the data) are drawn dashed. Maritime limits are not drawn. OpenStreetMap documents no positional accuracy for boundaries, so none is shown. Drawn into imagery tiles on the terrain: lines foreshorten when the view is tilted. |
| Status | integrated |

### Place names and points of interest (OpenFreeMap)

<a id="openfreemap-places"></a>

| | |
|---|---|
| Provider | OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data |
| Dataset | OpenMapTiles "place", "poi", "mountain_peak", "aerodrome_label" and "housenumber" layers, planet extract |
| Description | Country, state, city, town, village and neighbourhood names; airports and peaks (with height) from regional views; stations, hospitals, places of worship, schools, civic buildings, parks and shops close up; house numbers at street level. All chosen for each zoom and decluttered together. |
| Documentation | https://openmaptiles.org/schema/#poi |
| Endpoint | `https://tiles.openfreemap.org/planet` (mvt; Mapbox Vector Tiles via TileJSON) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | As mapped in OpenStreetMap. Points of interest are in the zoom-14 tiles, so they appear from about 1:30 000: a central Chennai tile holds 1 486 points (875 named) and 63 house numbers, a central Madurai tile 506 points (checked 2026-11-01). |
| Resolution | Point positions quantised to 4096 units per tile at each zoom (~0.6 m at the equator at zoom 14). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Planet rebuilt regularly; the active build date is reported in the TileJSON URL. |
| Rate limits | No limits on map views; please keep request volume reasonable. |
| Caching | Cache-Control on tiles from the provider; TileJSON max-age=3600. |
| Licence | [ODbL (data); OpenMapTiles schema (BSD/CC-BY)](https://www.openstreetmap.org/copyright) |
| Attribution | OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL). |
| Limitations | English names (name:en) where mapped, otherwise the local name. Gates, entrances, toilets, shelters, ATMs, parking and bus stops are left out: they outnumber everything else in a city (448 of the 1 486 points in the Chennai tile were gates). House numbers are sparse where OpenStreetMap has few addresses, which includes most of India. Labels are drawn into imagery tiles: they are not searchable or selectable, and a name can be cut where tiles of different zoom meet. |
| Status | integrated |

### Coastlines

<a id="gibs-coastlines"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | Coastlines_15m |
| Description | Coastline outlines rendered by GIBS from OpenStreetMap data. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Coastlines_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png` (wmts-rest; PNG overlay, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. |
| Resolution | Rendered to zoom 13. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | static: Static. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Static tiles. |
| Licence | [ODbL (OpenStreetMap data); NASA rendering](https://www.openstreetmap.org/copyright) |
| Attribution | Coastlines © OpenStreetMap contributors (ODbL), rendered by NASA GIBS. |
| Limitations | None recorded |
| Status | integrated |

### Dynamic surface water (OPERA DSWx-HLS)

<a id="gibs-surface-water"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | OPERA_L3_Dynamic_Surface_Water_Extent-HLS |
| Description | Surface water extent classified from Harmonized Landsat and Sentinel-2 scenes (NASA JPL OPERA). |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OPERA_L3_Dynamic_Surface_Water_Extent-HLS/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png` (wmts-rest; PNG overlay, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Land, excluding Antarctica; only where an HLS scene was acquired on the selected date. |
| Resolution | 30 m |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | https://www.jpl.nasa.gov/go/opera/products/dswx-product-suite/ |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Per-scene, selected UTC date. Coverage on any one day is sparse. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. OPERA Level-3 Dynamic Surface Water Extent from HLS, NASA JPL. |
| Limitations | Sparse: most of the globe is empty on a given day. Published with a lag of several days; recent dates return no tiles (HTTP 404), which Continuum treats as "no data", not an error. |
| Status | integrated |

### Flood (VIIRS, 1-day)

<a id="gibs-flood"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | VIIRS_Combined_Flood_1-Day |
| Description | Daily flood-water detection from VIIRS (NASA LANCE). |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Combined_Flood_1-Day/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png` (wmts-rest; PNG overlay, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global land, cloud-free observations only. |
| Resolution | 375 m |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Selected UTC date. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. VIIRS Combined Flood 1-Day, NASA LANCE. |
| Limitations | Cloud shadow can be misclassified as water. Opaque classification: grey marks insufficient data (cloud or night), not dry land. |
| Status | integrated |

### Precipitation rate (IMERG)

<a id="gibs-precipitation"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | IMERG_Precipitation_Rate |
| Description | Global precipitation rate from the GPM IMERG multi-satellite product. |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png` (wmts-rest; PNG overlay, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | 60°N–60°S (full), polar coverage partial. |
| Resolution | 0.1° (~10 km) |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | https://gpm.nasa.gov/data/imerg |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Selected UTC date (GIBS default 30-minute product for that day). |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. GPM IMERG Precipitation Rate. |
| Limitations | Coarse resolution; visual layer only. |
| Status | integrated |

### Sea surface temperature (GHRSST MUR)

<a id="gibs-sst"></a>

| | |
|---|---|
| Provider | NASA ESDIS — Global Imagery Browse Services (GIBS) |
| Dataset | GHRSST_L4_MUR_Sea_Surface_Temperature |
| Description | Multi-scale Ultra-high Resolution analysed sea surface temperature (JPL). |
| Documentation | https://nasa-gibs.github.io/gibs-api-docs/ |
| Endpoint | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png` (wmts-rest; PNG overlay, EPSG:3857) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global oceans. |
| Resolution | 0.01° (~1 km) |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | https://podaac.jpl.nasa.gov/MEaSUREs-MUR |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | daily: Daily analysis; typically 1–2 days behind real time. |
| Rate limits | None published. Continuum caps concurrent requests per host. |
| Caching | Cache-Control: no-store. |
| Licence | [NASA open data (no use restrictions)](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-information-policy) — NASA requests acknowledgement of GIBS in clients and presentations. |
| Attribution | Imagery: NASA GIBS, part of NASA ESDIS. GHRSST Level 4 MUR Global Foundation Sea Surface Temperature Analysis. |
| Limitations | Analysed (interpolated) field, not a direct observation everywhere. |
| Status | integrated |

### GEBCO 2026 bathymetry

<a id="gebco-2026"></a>

| | |
|---|---|
| Provider | General Bathymetric Chart of the Oceans (GEBCO) — IHO / IOC-UNESCO, hosted by BODC |
| Dataset | GEBCO_2026 Grid (GEBCO_LATEST_2 colour-shaded, GEBCO_LATEST shaded relief) |
| Description | Global terrain model for ocean and land at 15 arc-second intervals, visualised as a WMS image. |
| Documentation | https://www.gebco.net/data-products/gebco-web-services/web-map-service |
| Endpoint | `https://wms.gebco.net/mapserv?` (wms; PNG via WMS 1.1.1 GetMap, EPSG:4326) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global ocean and land. |
| Resolution | 15 arc-seconds (~460 m at the equator) grid; much of the seafloor is interpolated between sparse soundings. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid — the Type Identifier (TID) grid records which cells are measured. |
| Vertical datum | GEBCO: source data were assembled as if relative to mean sea level (some shallow areas use other vertical datums); the grid "can be assumed to be relative to WGS84". |
| Surface model | Bathymetry and land/ice-surface elevation (a sub-ice variant exists) |
| Updates | static: Annual release; GEBCO_2026 published April 2026. |
| Rate limits | None published. |
| Caching | Cache-Control: max-age=2630000 (~30 days). |
| Licence | [Public domain (GEBCO Grid terms of use); attribution required](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use) — Not to be used for navigation or safety at sea; must not imply GEBCO, IHO or IOC endorsement. |
| Attribution | GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid — a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa |
| Limitations | Imagery only: the WMS does not return depth values (GetFeatureInfo returns no results), so it is never used as a terrain mesh. Interpolated cells are visually indistinguishable from measured ones in this layer. Not for navigation (GEBCO terms of use). |
| Status | integrated |

### Lakes, rivers and canals (OpenFreeMap)

<a id="openfreemap-water"></a>

| | |
|---|---|
| Provider | OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data |
| Dataset | OpenMapTiles "water", "waterway" and "water_name" layers, planet extract |
| Description | Lakes, reservoirs and tanks, rivers, canals, streams and drains, with their names, drawn for each zoom over the imagery. Seasonal (intermittent) water is drawn lighter and dashed. |
| Documentation | https://openmaptiles.org/schema/#water |
| Endpoint | `https://tiles.openfreemap.org/planet` (mvt; Mapbox Vector Tiles via TileJSON) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | As mapped in OpenStreetMap; small water bodies are added as zoom increases. A zoom-10 tile over central Tamil Nadu holds 134 lakes and tanks; a zoom-12 tile near Madurai 55 lakes and 38 canals (checked 2026-11-01). The open sea is left to the imagery. |
| Resolution | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Planet rebuilt regularly; the active build date is reported in the TileJSON URL. |
| Rate limits | No limits on map views; please keep request volume reasonable. |
| Caching | Cache-Control on tiles from the provider; TileJSON max-age=3600. |
| Licence | [ODbL (data); OpenMapTiles schema (BSD/CC-BY)](https://www.openstreetmap.org/copyright) |
| Attribution | OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL). |
| Limitations | Outlines are as mapped in OpenStreetMap, not the water present today: a tank mapped at its full extent is drawn so in the dry season. Line widths are a display choice by class and zoom, not the river width. |
| Status | integrated |

### Roads and railways (OpenFreeMap)

<a id="openfreemap-roads"></a>

| | |
|---|---|
| Provider | OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data |
| Dataset | OpenMapTiles "transportation" and "transportation_name" layers, planet extract |
| Description | Roads from motorways to footpaths, railways and ferries, with street names, drawn for each zoom over the imagery. |
| Documentation | https://openmaptiles.org/schema/#transportation |
| Endpoint | `https://tiles.openfreemap.org/planet` (mvt; Mapbox Vector Tiles via TileJSON) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Roads as mapped in OpenStreetMap; the tiles add minor roads as zoom increases (service roads and paths at zoom 14). |
| Resolution | Geometry generalised for each zoom and quantised to 4096 units per tile; full OSM detail at zoom 14 (~0.6 m at the equator), drawn larger beyond it. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Planet rebuilt regularly; the active build date is reported in the TileJSON URL. |
| Rate limits | No limits on map views; please keep request volume reasonable. |
| Caching | Cache-Control on tiles from the provider; TileJSON max-age=3600. |
| Licence | [ODbL (data); OpenMapTiles schema (BSD/CC-BY)](https://www.openstreetmap.org/copyright) |
| Attribution | OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL). |
| Limitations | Road widths are a display choice by class and zoom, not the mapped carriageway width. A street name is placed along the longest straight stretch of its road in each tile, so curving streets may go unnamed. |
| Status | integrated |

### Building footprints (Overture Maps)

<a id="overture-buildings"></a>

| | |
|---|---|
| Provider | Overture Maps Foundation, conflating OpenStreetMap, Google Open Buildings, Microsoft Global ML Building Footprints and other sources |
| Dataset | Overture "buildings" theme, PMTiles archive of the latest release |
| Description | Building outlines, mapped by people or detected from imagery by machine learning, drawn at neighbourhood scale. |
| Documentation | https://docs.overturemaps.org/examples/overture-tiles |
| Endpoint | `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/<release>/buildings.pmtiles` (mvt; Mapbox Vector Tiles in a PMTiles archive, read with HTTP range requests) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. Far denser than OpenStreetMap alone where machine-detected footprints exist: a zoom-14 tile over central Kochi holds 7 365 buildings (OpenStreetMap via OpenFreeMap: 37). |
| Resolution | Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0.6 m at the equator); generalised at lower zooms. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Monthly releases; the latest is read from Overture’s STAC catalogue (stac.overturemaps.org) when the layer first loads. |
| Rate limits | None published. Continuum keeps four range requests in flight at most. |
| Caching | Amazon S3 object; tiles are kept decoded in memory for the session only. |
| Licence | [ODbL (theme); CC BY 4.0 for Google Open Buildings and Esri Community Maps contributions](https://docs.overturemaps.org/attribution/) |
| Attribution | Buildings: Overture Maps Foundation (overturemaps.org). © OpenStreetMap contributors (ODbL); Google Open Buildings (CC BY 4.0); Microsoft Global ML Building Footprints (ODbL); Esri Community Maps contributors (CC BY 4.0). |
| Limitations | Overture publishes these tiles for inspection, not as a production basemap, and removes older releases. If the release in use is withdrawn during a session, the layer shows nothing until reload. Footprints only: almost none carry a height (12 of 7 365 in central Kochi), so they are not extruded. Machine-detected outlines can be missing, merged or misplaced; each footprint’s source is in the data. Zoom-14 tiles reach ~2 MB in dense areas, so footprints load only at neighbourhood scale. |
| Status | integrated |

### Live clouds (geostationary infrared)

<a id="geostationary-clouds"></a>

| | |
|---|---|
| Provider | EUMETSAT (Meteosat, via EUMETView) and NASA ESDIS GIBS (GOES, Himawari) |
| Dataset | IR 10.8 µm images from Meteosat 0° and Meteosat Indian Ocean (EUMETView WMS msg_fes:ir108, msg_iodc:ir108); Band 13 Clean Infrared from GOES-East, GOES-West and Himawari (GIBS) |
| Description | Clouds from five geostationary satellites, stitched by longitude and looped over the last four hours, hour by hour. |
| Documentation | https://view.eumetsat.int/ |
| Endpoint | `https://view.eumetsat.int/geoserver/wms; https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/` (wms; PNG; EUMETView WMS GetMap and GIBS WMTS tiles, with a TIME dimension) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | All longitudes. Each longitude is drawn by the nearest satellite; imagery thins towards the poles, where geostationary views are oblique. |
| Resolution | Infrared imagery of about 2–3 km at the sub-satellite point, coarser towards the edge of each view. GIBS tiles are requested to zoom 5; Meteosat to zoom 3 (~20 km pixels), resampled beyond, because EUMETView renders each request on demand (measured 2026-11-01: 1–15 s per tile for Meteosat Indian Ocean, ~22 s for Meteosat 0°). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | near-real-time: Hourly frames; the newest is the latest full hour at least 45 minutes ago, so frames are 45–105 minutes old. EUMETView publishes every 15 minutes and GIBS every 10. |
| Rate limits | None published. Continuum keeps six requests in flight at most and requests nothing deeper than zoom 5. |
| Caching | EUMETView sends Cache-Control: max-age=604800; frames are reused while they stay in the loop. |
| Licence | [EUMETSAT data policy; NASA open data](https://www.eumetsat.int/eumetsat-streamlines-its-data-and-service-policy-make-more-data-free-charge) — Since 15 January 2019 hourly Meteosat imagery is not subject to licensing, while 15-minute imagery is free three hours after sensing, so Continuum uses hourly frames only. NASA GIBS imagery has no use restrictions. |
| Attribution | Live clouds: © EUMETSAT, Meteosat IR 10.8 µm via EUMETView. NASA ESDIS GIBS, GOES-East, GOES-West and Himawari Band 13 imagery. |
| Limitations | Opacity is a display rule on the infrared brightness temperature (clear at 0 °C, opaque at −40 °C), not a measured cloud fraction. Warm low cloud and fog are missed, and very cold ground can read as cloud. EUMETView publishes its infrared as greyscale without a scale. Its temperatures are fitted against Himawari where both see the same clouds (grey ≈ 70 − 3.2 × T °C, 67 424 pixel pairs over the Bay of Bengal, 2026-11-01). Neighbouring satellites see clouds from different angles and at slightly different times, so seams can show along the boundary longitudes. The loop shows real hourly frames, crossfaded; it does not interpolate motion between them. On a first visit the older frames join the loop as they load, over a minute or more; Europe and Africa (Meteosat 0°) come last. EUMETView responses are cached by the browser for seven days. |
| Status | integrated |

### Aerial photos of France (IGN)

<a id="ign-orthophotos"></a>

| | |
|---|---|
| Provider | Institut national de l’information géographique et forestière (IGN), Géoplateforme |
| Dataset | ORTHOIMAGERY.ORTHOPHOTOS (BD ORTHO) |
| Description | National aerial orthophotography of metropolitan France. |
| Documentation | https://geoservices.ign.fr/services-web |
| Endpoint | `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM` (wmts-rest; JPEG tiles, EPSG:3857, zoom 0–19) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Metropolitan France. Tiles beyond France come back pure white and are drawn as no data. |
| Resolution | BD ORTHO is a 20 cm product; the service goes to zoom 19 (~0.2 m pixels at 46°N). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Renewed department by department on IGN’s regular aerial survey cycle; dates vary by area. |
| Rate limits | None published. |
| Caching | Provider cache headers. |
| Licence | [Licence Ouverte / Open Licence (Etalab)](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) — IGN public data has been under the Etalab open licence since 1 January 2021. |
| Attribution | Orthophotos © IGN, Géoplateforme, Licence Ouverte (Etalab). |
| Limitations | Shown from regional zoom inwards only, over metropolitan France. |
| Status | integrated |

### Aerial photos of the Netherlands (PDOK)

<a id="pdok-luchtfoto"></a>

| | |
|---|---|
| Provider | Beeldmateriaal Nederland, served by PDOK |
| Dataset | Luchtfoto RGB, Actueel_orthoHR |
| Description | National high-resolution aerial photography of the Netherlands, current year. |
| Documentation | https://www.pdok.nl/ |
| Endpoint | `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg` (wmts-rest; JPEG tiles, EPSG:3857, zoom 0–21) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | The Netherlands. Tiles beyond it come back pure white and are drawn as no data. |
| Resolution | 8 cm in the web services (some areas captured at 5 cm). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Flown annually; "Actueel" is the most recent year. |
| Rate limits | None published. |
| Caching | Provider cache headers. |
| Licence | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Attribution | Luchtfoto © Beeldmateriaal Nederland, via PDOK, CC BY 4.0. |
| Limitations | Shown from regional zoom inwards only, over the Netherlands. |
| Status | integrated |

### Aerial photos of Switzerland (swisstopo SWISSIMAGE)

<a id="swisstopo-swissimage"></a>

| | |
|---|---|
| Provider | Federal Office of Topography swisstopo |
| Dataset | ch.swisstopo.swissimage (current) |
| Description | National aerial orthophoto mosaic of Switzerland. |
| Documentation | https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10 |
| Endpoint | `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg` (wmts-rest; JPEG tiles, EPSG:3857, zoom 0–20) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Switzerland, with imagery a little beyond its borders. |
| Resolution | SWISSIMAGE 10 cm product; the service goes to zoom 20. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Renewed on swisstopo’s survey cycle; dates vary by area. |
| Rate limits | None published. |
| Caching | Provider cache headers. |
| Licence | [swisstopo free geodata (OGD) terms](https://www.swisstopo.admin.ch/en/conditions-geodata) — Free use, including commercial, with the source credited. |
| Attribution | SWISSIMAGE © Federal Office of Topography swisstopo. |
| Limitations | Shown from regional zoom inwards only, over Switzerland. |
| Status | integrated |

### Aerial photos of Austria (basemap.at)

<a id="basemap-at-orthofoto"></a>

| | |
|---|---|
| Provider | basemap.at (Austrian federal states and partners) |
| Dataset | bmaporthofoto30cm |
| Description | Aerial orthophoto mosaic of Austria. |
| Documentation | https://basemap.at/en/ |
| Endpoint | `https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg` (xyz; JPEG tiles, EPSG:3857, zoom 0–20) |
| Capabilities | imagery-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Austria. Tiles beyond it return 404 and are drawn as no data. |
| Resolution | Not stated by the provider (the layer is named "30cm"); the service goes to zoom 20. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Not stated per area. |
| Rate limits | None published. |
| Caching | Provider cache headers. |
| Licence | [CC BY 4.0 (Open Government Data Austria)](https://basemap.at/en/) |
| Attribution | Data source: basemap.at (CC BY 4.0). |
| Limitations | Shown from regional zoom inwards only, over Austria. |
| Status | integrated |

### OpenStreetMap buildings (OpenFreeMap)

<a id="openfreemap-buildings"></a>

| | |
|---|---|
| Provider | OpenFreeMap (vector tiles, OpenMapTiles schema) from OpenStreetMap data |
| Dataset | OpenMapTiles "building" layer, planet extract |
| Description | Building footprints with rendered heights, extruded in 3D at city scale. |
| Documentation | https://openmaptiles.org/schema/#building |
| Endpoint | `https://tiles.openfreemap.org/planet` (mvt; Mapbox Vector Tiles via TileJSON) |
| Capabilities | vector-tiles |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Wherever OpenStreetMap contributors have mapped buildings; completeness varies widely. |
| Resolution | Vector geometry quantised to the zoom-14 tile grid (4096 units per tile, ~0.6 m at the equator). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | periodic: Planet rebuilt regularly; the active build date is reported in the TileJSON URL. |
| Rate limits | No limits on map views; please keep request volume reasonable. |
| Caching | Cache-Control on tiles from the provider; TileJSON max-age=3600. |
| Licence | [ODbL (data); OpenMapTiles schema (BSD/CC-BY)](https://www.openstreetmap.org/copyright) |
| Attribution | OpenFreeMap © OpenMapTiles. Data © OpenStreetMap contributors (ODbL). |
| Limitations | Heights come from OSM height or building:levels tags; where neither is mapped, the OpenMapTiles schema assigns a default, so many heights are estimates. Building bases are placed on the terrain at the footprint centroid. |
| Status | integrated |

### USGS earthquakes

<a id="usgs-earthquakes"></a>

| | |
|---|---|
| Provider | U.S. Geological Survey — Earthquake Hazards Program |
| Dataset | ComCat real-time GeoJSON summary feeds |
| Description | Earthquakes worldwide reported by the USGS and contributing networks. |
| Documentation | https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php |
| Endpoint | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{threshold}_{window}.geojson` (geojson; GeoJSON FeatureCollection) |
| Capabilities | feature-feed |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global for M4.5+; denser and more complete in the United States. |
| Resolution | Point hypocentres. |
| Horizontal accuracy | Per event (horizontalError in the detail feed); typically km-scale outside dense networks. |
| Vertical accuracy | Per event (depthError); depths are often fixed by the solution. |
| Accuracy reference | https://earthquake.usgs.gov/data/comcat/data-eventterms.php |
| Vertical datum | Depth in km. NEIC references depths to the WGS84 geoid; other contributing networks may use mean sea level or average station elevation (USGS FAQ: https://www.usgs.gov/faqs/what-reference-datum-used-earthquake-depths). |
| Surface model | Not applicable |
| Updates | near-real-time: Feeds regenerate every minute. Events are revised after publication. |
| Rate limits | None published; feeds are cached for 60 s and Continuum polls no faster. |
| Caching | Cache-Control: public, max-age=60. |
| Licence | [Public domain (U.S. Government work)](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) |
| Attribution | Earthquake data courtesy of the U.S. Geological Survey. |
| Limitations | Automatic solutions are revised; magnitudes of different types (ml, mb, Mw) are not directly comparable. |
| Status | integrated |

### NASA EONET natural events

<a id="nasa-eonet"></a>

| | |
|---|---|
| Provider | NASA Earth Observatory Natural Event Tracker |
| Dataset | EONET v3 events |
| Description | Curated natural events — wildfires, severe storms, volcanoes, sea and lake ice, floods — linked to their sources. |
| Documentation | https://eonet.gsfc.nasa.gov/docs/v3 |
| Endpoint | `https://eonet.gsfc.nasa.gov/api/v3/events` (json-rest; JSON) |
| Capabilities | feature-feed |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global; inclusion depends on the contributing sources. |
| Resolution | Points, tracks and polygons as supplied by each source. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | near-real-time: Updated as sources report. Geometry dates default to 00:00Z when the source gives no time. |
| Rate limits | x-ratelimit-limit: 60 per window (observed header). |
| Caching | Cache-Control: no-cache. |
| Licence | [NASA open data; individual sources keep their own terms](https://eonet.gsfc.nasa.gov/docs/v3) |
| Attribution | NASA Earth Observatory Natural Event Tracker (EONET) and its linked sources. |
| Limitations | An index of events, not an authoritative hazard warning service. "closed" dates may not mark the true end of an event. |
| Status | integrated |

### Copernicus DEM GLO-90 (via Open-Meteo)

<a id="open-meteo-elevation"></a>

| | |
|---|---|
| Provider | Open-Meteo, serving the Copernicus DEM (ESA / Airbus) |
| Dataset | Copernicus DEM 2021 release, GLO-90 |
| Description | Point elevations from the Copernicus global digital surface model. |
| Documentation | https://open-meteo.com/en/docs/elevation-api |
| Endpoint | `https://api.open-meteo.com/v1/elevation` (json-rest; JSON) |
| Capabilities | point-elevation |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global land. |
| Resolution | 90 m (3 arc-seconds) |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Copernicus DEM specification: < 4 m absolute vertical accuracy (90% linear error) for GLO-30; GLO-90 is derived from it. Open-Meteo does not restate it. |
| Accuracy reference | https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model |
| Vertical datum | EGM2008 geoid (Copernicus DEM); Open-Meteo does not state its handling. |
| Surface model | DSM — includes buildings and forest canopy. |
| Updates | static: TanDEM-X acquisitions 2011–2015. |
| Rate limits | < 600/min, 5 000/h, 10 000/day (free tier). |
| Caching | No caching headers. |
| Licence | [Open-Meteo free API: non-commercial use; data CC BY 4.0](https://open-meteo.com/en/terms) — Free tier allows < 10 000 calls/day per application. Continuum calls it once per inspection. |
| Attribution | Copernicus DEM GLO-90 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; served by Open-Meteo.com (CC BY 4.0). |
| Limitations | Non-commercial free tier. Surface model: rooftops and canopy, not bare ground. |
| Status | integrated |

### USGS 3DEP point query (EPQS)

<a id="usgs-epqs"></a>

| | |
|---|---|
| Provider | U.S. Geological Survey — 3D Elevation Program |
| Dataset | 3DEP best-available DEM (1 m – 1/3 arc-second) |
| Description | Bare-earth elevation at a point from the best available 3DEP layer. |
| Documentation | https://epqs.nationalmap.gov/v1/docs |
| Endpoint | `https://epqs.nationalmap.gov/v1/json` (json-rest; JSON) |
| Capabilities | point-elevation |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | United States, Puerto Rico and territories. |
| Resolution | Reported per query (1 m where lidar-derived, otherwise 1/3 or 1 arc-second). |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | 3DEP lidar Quality Level 2: ≤ 10 cm RMSEz (non-vegetated) for the source lidar; the DEM product is not restated per point. |
| Accuracy reference | https://www.usgs.gov/3d-elevation-program/about-3dep-products-services |
| Vertical datum | NAVD88 (CONUS); local datums in territories. |
| Surface model | DTM — bare earth. |
| Updates | periodic: Acquisition date returned with each point. |
| Rate limits | None published. Responses were observed to take up to ~18 s. |
| Caching | No caching headers. |
| Licence | [Public domain (U.S. Government work)](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) |
| Attribution | Elevation courtesy of the U.S. Geological Survey 3D Elevation Program. |
| Limitations | US only; slow. |
| Status | integrated |

### NOAA NCEI DEM global mosaic

<a id="noaa-ncei-dem"></a>

| | |
|---|---|
| Provider | NOAA National Centers for Environmental Information |
| Dataset | DEM_mosaics/DEM_global_mosaic ImageServer (NCEI DEMs over a global base) |
| Description | Point elevation and depth from NOAA’s mosaic of coastal, regional and global DEMs. |
| Documentation | https://www.ncei.noaa.gov/products/coastal-elevation-models |
| Endpoint | `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify` (json-rest; ArcGIS ImageServer identify (JSON)) |
| Capabilities | point-elevation |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global, with high-resolution coastal DEMs mainly around the United States. |
| Resolution | Varies by contributing DEM; the service reports its catalogue item but not a resolution per point. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Varies by contributing DEM; not reported by the service per point. |
| Surface model | Integrated topography–bathymetry. |
| Updates | static: Mosaic of DEMs with differing build dates. |
| Rate limits | None published. |
| Caching | No caching headers. |
| Licence | [Public domain (U.S. Government work)](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso) |
| Attribution | Elevation and bathymetry courtesy of NOAA National Centers for Environmental Information. |
| Limitations | Vertical datum and resolution are not reported per point. |
| Status | integrated |

### Current weather (Open-Meteo)

<a id="open-meteo-weather"></a>

| | |
|---|---|
| Provider | Open-Meteo, from national weather service models |
| Dataset | Open-Meteo Forecast API, "best match" model blend |
| Description | Current modelled conditions at a selected point. |
| Documentation | https://open-meteo.com/en/docs |
| Endpoint | `https://api.open-meteo.com/v1/forecast` (json-rest; JSON) |
| Capabilities | point-weather |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. |
| Resolution | Model grid: ~1–11 km depending on region and model. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | near-real-time: Model output for the current 15-minute interval; not an observation. |
| Rate limits | < 600/min, 5 000/h, 10 000/day (free tier). |
| Caching | No caching headers. |
| Licence | [Open-Meteo free API: non-commercial use; data CC BY 4.0](https://open-meteo.com/en/terms) |
| Attribution | Weather data by Open-Meteo.com (CC BY 4.0), from national weather service models. |
| Limitations | Modelled values, not station observations. Non-commercial free tier. |
| Status | integrated |

### Nominatim place search

<a id="osm-nominatim"></a>

| | |
|---|---|
| Provider | OpenStreetMap Foundation |
| Dataset | OpenStreetMap |
| Description | Search for places by name. |
| Documentation | https://nominatim.org/release-docs/latest/api/Search/ |
| Endpoint | `https://nominatim.openstreetmap.org/search` (json-rest; JSON (jsonv2)) |
| Capabilities | geocode |
| Authentication | None |
| CORS (browser) | Verified 2026-11-01; Access-Control-Allow-Origin: * |
| Coverage | Global. |
| Resolution | Place centroids and bounding boxes. |
| Horizontal accuracy | Not stated by the provider |
| Vertical accuracy | Not stated by the provider |
| Accuracy reference | — |
| Vertical datum | Not applicable |
| Surface model | Not applicable |
| Updates | near-real-time: Follows OpenStreetMap edits within minutes to hours. |
| Rate limits | Usage policy: at most 1 request per second; no autocomplete; identify via Referer. |
| Caching | Continuum keeps recent results in memory for the session only. |
| Licence | [ODbL 1.0](https://www.openstreetmap.org/copyright) |
| Attribution | Search results © OpenStreetMap contributors, ODbL 1.0, via Nominatim. |
| Limitations | Searches run only on explicit submit (no as-you-type), at most one per second, per the OSMF usage policy. Can be switched off in configuration without a code change if OSMF asks. |
| Status | integrated |

### Investigated, not integrated

| Source | Reason |
|---|---|
| ISRO Bhuvan WMS and tile cache (India) | Both answer (bhuvan-vec1 WMS, bhuvan-ras2 tile cache) but send no CORS headers (checked 2026-11-01), so a browser on another site cannot read them. OpenStreetMap data covers the same roads, water and places. |
| Bharatmaps (NIC, India) | Its certificate chain did not verify against the Mozilla root store (SELF_SIGNED_CERT_IN_CHAIN, checked 2026-11-01); not evaluated further. |
| TN-GIS (Tamil Nadu e-Governance Agency) | Its layers and Web API services sit behind an official or public account login, and its map viewer asks for GeoServer credentials (checked 2026-11-01). |
| Overture Maps places | Browser-accessible and CDLA-Permissive-2.0, but heavy where it is densest: a zoom-14 tile over central Chennai is 4.3 MB (5 356 places), over Madurai 3.1 MB (3 857) (checked 2026-11-01). Points of interest come from OpenStreetMap instead, at about a tenth of the size. |
| Copernicus DEM GLO-30 / GLO-90 (direct) | Copernicus Data Space downloads need registration. The public AWS copies (copernicus-dem-30m) send no CORS headers, so a browser cannot read them. GLO-90 point values are available through Open-Meteo instead. |
| Cesium World Terrain, Cesium OSM Buildings, Bing imagery (Cesium ion) | Require a Cesium ion access token. |
| OpenSky Network aircraft states | Anonymous REST access works, but the API only allows its own origin (CORS), so browsers elsewhere are refused. |
| NASA FIRMS active fire API | Needs a MAP_KEY. The same detections are shown visually through GIBS thermal-anomaly layers in a later release. |
| OpenTopography global DEM API | Needs an API key. |
| Open Topo Data public API | No CORS headers on responses; a browser cannot read them. |
| OpenStreetMap standard tiles (tile.openstreetmap.org) | Usage policy discourages applications using it as a default layer; OSM data reaches Continuum through OpenFreeMap vector tiles instead. |
| EUMETSAT Meteosat imagery every 15 minutes | Under EUMETSAT’s data policy, 15-minute imagery is free only three hours after sensing, while hourly imagery is free in real time. The live clouds use hourly frames. |
| RainViewer satellite infrared | The public weather-maps feed lists no satellite frames any more (checked 2026-11-01); only radar remains. |
| GSI Japan seamless aerial photos (地理院タイル) | Browser-accessible (CORS *), but the terms may require an approval application when a map is a site’s main content, as it is here. Not integrated until that is clarified. |
| IGN Spain PNOA orthophotos | Browser-accessible and CC BY 4.0, but beyond Spain the service returns a low-detail fill (e.g. over Portugal) that would cover the Sentinel-2 imagery there. |
| OpenAerialMap mosaic (Kontur) | The mosaic tile server (apps.kontur.io) did not accept connections when tested. |
| NASA GIBS Reference_Labels and Reference_Features (raster, OpenStreetMap) | Used in v0.1.0, then replaced. The tiles stop at zoom 9 and are only magnified beyond it, so names grow and never thin out as you zoom in, and borders stay coarse. The 15 m variants returned opaque black tiles and HTTP 500s. Borders and place names now come from OpenFreeMap vector tiles, drawn for each zoom. |
| Esri World Imagery | Tiles respond to browsers, but production use is governed by Esri terms that expect an ArcGIS account. |
| Stadia / MapTiler / Thunderforest basemaps | Require an API key or domain registration. |
| Moon, Mars and planetary terrain (NASA Trek WMTS) | Planned for the beyond-Earth phase; not yet evaluated for browser access. |

<!-- catalogue:end -->
