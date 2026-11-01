# Research

Findings that shaped Continuum's first version, with sources. Everything here was either
read from the provider's own documentation or **measured** from a real browser; the two
are kept distinct. Research date: 2026-11-01.

- Browser access evidence: [`docs/research/probe-results.json`](research/probe-results.json),
  produced by [`tools/probe-endpoints.mjs`](../tools/probe-endpoints.mjs). The probe loads a
  page at a third-party origin in Chromium and requests every candidate endpoint exactly as
  the app would — `fetch()` for data, and `<img crossOrigin>` followed by a canvas
  read-back for tiles (a tainted canvas means the tile can never become a WebGL texture).
  A successful `curl` proves nothing about CORS; this does.
- The provider catalogue that resulted is [DATA_SOURCES.md](DATA_SOURCES.md).

## 1. Properties that are not interchangeable

The directive warns against conflating these, and the research found real cases of each:

| Property | Example where it held | Example where it did not |
|---|---|---|
| Free to access | Esri World Imagery tiles load from a browser | …but production use is governed by Esri terms expecting an ArcGIS account |
| Openly licensed | Copernicus DEM is free and open | …but the public AWS copy sends no CORS headers, so a browser cannot read it |
| Publicly downloadable | GEBCO 2026 grid downloads freely | …its WMS returns pictures only; GetFeatureInfo returns no values |
| Browser-accessible | OpenSky anonymous REST answers | …but only with `Access-Control-Allow-Origin: https://opensky-network.org` |
| Real-time | USGS earthquake feeds regenerate every minute | GIBS daily layers lag; OPERA surface water lags by days |

## 2. Terrain

### Candidates

| Option | Access | Verdict |
|---|---|---|
| **AWS Terrain Tiles (Terrarium PNG)** — Tilezen/Joerd composite | Public S3, no key, `Access-Control-Allow-Origin: *` (measured) | **Integrated** |
| Terrain Tiles *normal*, GeoTIFF, Skadi formats | Same bucket, CORS ok (measured) | Not needed: Terrarium carries the heights; Skadi is 1° HGT files (download-sized) |
| Cesium World Terrain (quantized-mesh) | Needs a Cesium ion token | Rejected (key) |
| Copernicus DEM GLO-30/90 COGs on AWS | Public S3 but **no CORS headers** (measured: `Failed to fetch`) | Future (needs a proxy or re-hosting) |
| Copernicus Data Space | Registration required | Future |
| OpenTopography | API key | Future |
| MapLibre `raster-dem` terrain | Would consume the same Terrarium tiles | Not chosen — Cesium is the globe engine (§6) |

**Documentation**: <https://registry.opendata.aws/terrain-tiles/>,
<https://github.com/tilezen/joerd/tree/master/docs>.
The registry lists the bucket as "managed by Mapzen, a Linux Foundation project",
updated "based on community feedback"; joerd's docs say regular updates are not planned
(v1 2016, v1.1 2017). It is an AWS Open Data sponsorship with **no SLA** — usable from
browsers, but not a contracted CDN.

**Encoding** (verified by unit test and against live tiles):
`height = (R·256 + G + B/256) − 32768` metres. Decoding must use
`createImageBitmap(…, { colorSpaceConversion: 'none' })`: a colour-managed decode alters
RGB and therefore the heights.

### Terrain findings (measured)

Sampling live tiles revealed four properties of the product that are not in its
documentation and that Continuum has to handle. Each is handled with real data only, and
each affected pixel is flagged to the user (see [ACCURACY.md](ACCURACY.md)).

**a. Every tile names its sources — and the browser can read them.** S3 returns
`x-amz-meta-x-imagery-sources` (e.g. `srtm/N27E086.tif, srtm/N27E087.tif`) and the header is
readable from cross-origin `fetch()` (measured). The prefixes observed across 16 regions:
`srtm`, `gmted` (`mea075` 7.5″, `mea300` 30″), `etopo1`, `ned13` (3DEP ⅓″), `ned`
(3DEP 1/9″ and California topobathy), `eudem`, `austria`, `uk_lidar`, `nrcan_cdem`,
`kartverket`, `nzlinz`, `mx_lidar`, `pgdc_5m` (ArcticDEM), `geoscience_au`. Continuum's
inspector reports the actual source files under any point.

**b. Sea-level fill replaces bathymetry at zoom ≥ 11 in parts of the ocean.**

| Point | z8 | z9 | z10 | z11 | z12 | z15 |
|---|---|---|---|---|---|---|
| Challenger Deep (11.3733, 142.5917) | −10 474 [etopo1] | −10 458 | −10 434 | **0** [gmted] | **0** | **0** |
| Off Sri Lanka (6.0, 82.5) | −4 056 | −4 055 | −4 055 | **0** [gmted] | **0** | **0** |
| Mid-Pacific (0, −150) | −4 256 | −4 280 | −4 292 | −4 300 [etopo1] | −4 301 | −4 233 |

GMTED and SRTM fill water with 0 m (joerd docs confirm this). Without handling, zooming in
over the ocean would lift the seafloor to sea level and the inspector would report 0 m at
the deepest point on Earth.

**c. ETOPO1 *Bedrock* removes the ice sheets at mid zooms.**

| Point | z3 | z6 | z8 | z10 | z12 |
|---|---|---|---|---|---|
| Vostok (−78.46, 106.83) | 3 498 [gmted] | −95 [etopo1] | −94 | −94 | 3 500 [gmted] |
| Dome A (−80.37, 77.35) | 4 084 | 1 608 | 1 610 | 1 611 | 4 086 |
| Greenland Summit (72.58, −38.46) | 3 209 | 261 | 259 | 3 255 [ArcticDEM] | 3 256 |

The source file is `ETOPO1_Bed_g.tif` — the bedrock grid. Antarctica's interior would
sink ~3.5 km and pop back up while zooming.

**d. ArcticDEM heights are WGS84 ellipsoidal, every other source is orthometric.**
Compared with the Copernicus DEM (EGM2008 orthometric, via Open-Meteo):

| Site | Terrarium | Copernicus GLO-90 | Difference | EGM96 N |
|---|---|---|---|---|
| Reykjavík airport [pgdc_5m] | 78.4 | 12 | **+66.4** | 66.4 |
| Greenland Summit [pgdc_5m] | 3 255.9 | 3 208 | **+47.9** | 43.9 |
| Greenland ice 70°N 40°W [pgdc_5m] | 2 969.7 | 2 918 | **+51.7** | 45.6 |
| Longyearbyen airport [pgdc_5m] | 58.4 | 25 | **+33.4** | 32.2 |
| Denver [ned19] (control) | 1 596.7 | 1 599 | −2.3 | −17.0 |
| Kathmandu valley [srtm] (control) | 1 293.0 | 1 289 | +4.0 | −50.0 |

The ArcticDEM differences track N; the controls do not. Joerd's public source has no
ArcticDEM ingestion code to confirm this, so it is an empirical conclusion, recorded as such.

**e. Resolution ≠ accuracy.** At Everest the zoom-12 tile's highest pixel is 8 753 m
(surveyed summit 8 848.86 m): SRTM's 30 m radar grid smooths peaks. Tile grid spacing
(4.8 m × cos φ at z15) is a property of the tiling, not of the data.

### Adapter design

Cesium's globe is a geographic (EPSG:4326) quadtree; Terrarium is Web Mercator. Rendering a
Mercator terrain directly leaves holes beyond ±85.05°. `TerrariumTerrainProvider`
therefore produces 65×65 geographic heightmaps by bilinearly resampling the Mercator tiles
that cover each one — geographic level *L* at the same longitudinal spacing as Mercator
zoom *L*−1, so no detail is invented or discarded. Heights are converted to ellipsoidal
with EGM96 (Cesium's globe is ellipsoidal). `CustomHeightmapTerrainProvider` was rejected
because it offers no hook for request back-pressure, cancellation or provenance.

## 3. Geoid

Cesium needs ellipsoidal heights; the DEMs are (mostly) orthometric. EGM96 is the datum of
SRTM and GMTED2010, so it is the right model. NGA's 15′ grid (WW15MGH) was taken from
`egm96-universal` (MIT, tested against NGA's Fortran reference), delta-encoded and gzipped:
**937 KB** shipped as a static asset instead of a 2.77 MB JavaScript module (1.85 MB
gzipped). A unit test checks Continuum's interpolation agrees with `egm96-universal` within
6 mm at 5 000 random points.

## 4. Imagery

| Option | Resolution | Access (measured) | Licence | Verdict |
|---|---|---|---|---|
| **EOX Sentinel-2 cloudless 2025** | 10 m | CORS (origin echoed); WGS84 matrix matches Cesium's geographic scheme (2×1 tiles at level 0, 18 levels) | CC BY-NC-SA 4.0; commercial needs EOX licence | **Integrated (default)** |
| **NASA GIBS** daily MODIS / VIIRS, Blue Marble, Black Marble | 250–500 m | CORS `*` | NASA open data | **Integrated** |
| **USGS National Map orthoimagery** | ~1 m (US) | CORS `*` | Public domain | **Integrated** |
| Esri World Imagery | sub-metre | CORS `*` | Esri terms (account expected) | Rejected |
| Bing / Google | — | Keys | — | Rejected |
| HLS (Landsat/Sentinel 30 m) via GIBS | 30 m | Available | NASA | Deferred: sparse per day |

GIBS EPSG:4326 matrices start with 288°-wide tiles, which do not match Cesium's geographic
tiling, so GIBS is consumed in EPSG:3857 (`GoogleMapsCompatible_LevelN`) and reprojected by
Cesium. Daily GIBS layers send `Cache-Control: no-store`; the in-memory tile cache is the
only reuse within a session.

**Reliability finding.** `Reference_Labels_15m` and `Reference_Features_15m` returned
**fully opaque black tiles** for many low-zoom tiles and HTTP 500 for 15–25% of requests
(measured, repeated). The opaque tiles covered the imagery beneath them, so whole 45°
regions of the globe showed as dark blocks (reproduced, and confirmed to disappear with the
layer off). The coarser `Reference_Labels`/`Reference_Features` (zoom 9) returned
transparent tiles with no errors and were adopted. Separately, because Cesium abandons a
failed tile for the session, Continuum retries transient failures and replaces a tile that
still fails with a transparent one.

## 5. Bathymetry, geography, events, weather

- **GEBCO 2026** — WMS GetMap works from browsers (CORS `*`); **GetFeatureInfo returns no
  values**, so GEBCO is image-only and never used as terrain. Public domain with
  attribution; *not for navigation* (terms of use).
- **NOAA NCEI DEM Global Mosaic** — ArcGIS ImageServer `identify` works from browsers
  (Challenger Deep: −10 317.6 m) and names the contributing DEM; used for independent point
  depths.
- **OpenStreetMap** — the standard tile server's policy says apps must not use it as a
  default layer; OSM data reaches Continuum via NASA GIBS reference layers (raster labels)
  and **OpenFreeMap** vector tiles (buildings): no key, no registration, commercial use
  allowed, attribution required (<https://openfreemap.org/>).
- **USGS earthquakes** — GeoJSON feeds, updated every minute, `Cache-Control: max-age=60`.
  Depth reference varies by network; NEIC uses the WGS84 geoid (USGS FAQ).
- **NASA EONET v3** — open events with point, track or polygon geometry; observed
  `x-ratelimit-limit: 60`. An index, not a warning service.
- **Open-Meteo** — elevation (Copernicus GLO-90) and current weather; free tier is
  non-commercial, < 10 000 calls/day; data CC BY 4.0.
- **USGS EPQS** — 3DEP point elevation with acquisition date; responses took up to ~18 s.
- **Nominatim** — usage policy: ≤ 1 request/s, no autocomplete, identify via Referer,
  attribution, and be able to switch it off. Continuum searches on submit only, through a
  1.1 s gate, with a configuration kill-switch.
- **Rejected for browser use:** OpenTopoData (no CORS headers), OpenSky (CORS restricted to
  its own origin), NASA FIRMS API (MAP_KEY), Stadia/MapTiler/Thunderforest (keys).

## 6. Rendering engine

| | CesiumJS | MapLibre GL JS | Three.js |
|---|---|---|---|
| WGS84 ellipsoid globe, geodetic camera | Native | Globe projection, not a 3D ellipsoid scene | Build it yourself |
| Streaming terrain LOD | Native quadtree, pluggable providers | `raster-dem` | Build it yourself |
| Imagery layers, WMTS/WMS | Native | Native (raster sources) | — |
| Entities, picking, 3D Tiles, beyond-Earth ellipsoids | Native | Partial | — |
| Size | ~4.2 MB JS (1.1 MB gzip) | ~0.8 MB | ~0.6 MB |

CesiumJS (1.146) was chosen; one engine only. Its ion services are unused and the ion
access token is set empty so accidental use fails visibly. MapLibre was not added: its
strength (vector styling) is not needed for v1, and two GL contexts cost memory. Vector
tiles are decoded directly with `@mapbox/vector-tile`.

## 7. Level of detail and request discipline

- Cesium selects tiles by screen-space error (`maximumScreenSpaceError` 2, 4 in
  low-performance mode). Nothing outside the view frustum is requested.
- Terrain fetches go through a bounded priority queue (6 concurrent), de-duplicated by tile
  key. When the queue is full the provider declines and Cesium asks again next frame, so
  tiles the camera has left are simply never requested.
- Every 0.5 s, terrain fetches whose tiles lie outside the camera's view rectangle (plus 2°)
  are aborted (`AbortController`), except fetches the user is waiting on (inspection,
  profiles).
- Cesium does not cancel terrain requests itself; the provider marks aborted requests as
  `CANCELLED` so Cesium retries if, and only if, the tile is still wanted.
- Imagery uses Cesium's request scheduler, capped at 8 per host.
- Rendering is in request-render mode: an idle globe renders nothing.
- Feeds stop polling while the tab is hidden and catch up when it returns.

## 8. Gamepad navigation

From the W3C Gamepad specification (<https://w3c.github.io/gamepad/>) and MDN:
the API exposes **state, not events** — buttons must be polled and edges derived; a press
shorter than one frame can be missed (a real effect under software rendering at ~3 fps,
which the end-to-end tests account for). Controllers appear only after the user presses a
button. `mapping === 'standard'` guarantees the documented index layout; anything else
needs rebinding, and triggers on non-standard pads often appear as axes resting at −1.
Design consequences are in [GAMEPAD.md](GAMEPAD.md).

## 9. Hosting

| | Cloudflare Pages (git integration) | Cloudflare Pages (Wrangler from a workflow) | **GitHub Pages (workflow)** |
|---|---|---|---|
| Deployment declared in the repository | No — dashboard setting | Yes | **Yes** |
| Credentials needed now | Cloudflare account linking | `CLOUDFLARE_API_TOKEN` secret | **None beyond the repository** |
| Ecosystem precedent | — | — | blog, nexus, timeline… |
| CDN | Cloudflare | Cloudflare | Fastly, behind Cloudflare DNS proxy as for sibling subdomains |

The directive's recommended default (connect Cloudflare Pages to the repository) is a
deployment by platform setting, which the ecosystem's deployment standard does not permit.
Wrangler from a workflow would comply but needs an API token this session does not have.
**GitHub Pages deployed by a committed workflow** complies, needs nothing extra, and
matches how the sibling subdomains are served. See [DEPLOYMENT.md](DEPLOYMENT.md).

## 10. Licensing and attribution

- Terrain Tiles require attribution to *every* contributing dataset; the full text is in
  the source catalogue and Cesium's on-screen credit line carries the short form.
- EOX Sentinel-2 cloudless and the Open-Meteo free tier are **non-commercial**. Continuum
  is free, with no advertising and no subscription. If that changes, both must be replaced
  or licensed — recorded as a limitation in the catalogue.
- GEBCO: attribution, no implied endorsement, not for navigation.
- ODbL applies to OSM-derived labels, buildings and search results.
- Attribution is rendered on screen at every screen size, not hidden behind a toggle.

## Sources

- AWS Open Data — Terrain Tiles: <https://registry.opendata.aws/terrain-tiles/>
- Joerd docs (attribution, data sources, formats): <https://github.com/tilezen/joerd/tree/master/docs>
- NASA GIBS API: <https://nasa-gibs.github.io/gibs-api-docs/access-basics/>
- EOxCloudless licence: <https://cloudless.eox.at/documentation/license>
- GEBCO grid and terms: <https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid>, <https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use>
- USGS earthquake feeds: <https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php>; depth datum: <https://www.usgs.gov/faqs/what-reference-datum-used-earthquake-depths>
- NASA EONET v3: <https://eonet.gsfc.nasa.gov/docs/v3>
- Open-Meteo terms and elevation API: <https://open-meteo.com/en/terms>, <https://open-meteo.com/en/docs/elevation-api>
- USGS EPQS: <https://epqs.nationalmap.gov/v1/docs>
- OSMF tile and Nominatim policies: <https://operations.osmfoundation.org/policies/tiles/>, <https://operations.osmfoundation.org/policies/nominatim/>
- OpenFreeMap: <https://openfreemap.org/>
- GeographicLib (Karney 2013): <https://geographiclib.sourceforge.io/>
- W3C Gamepad: <https://w3c.github.io/gamepad/>; MDN: <https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API>
