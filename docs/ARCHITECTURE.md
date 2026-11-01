# Architecture

Continuum is a static single-page application. There is no server-side code of any kind:
the deployed artifact is HTML, JavaScript, CSS, CesiumJS's static assets and one data file
(the EGM96 geoid grid). Every provider request is made by the reader's browser.

```
                 ┌──────────────────────── browser ─────────────────────────┐
                 │  React UI (panels, dialogs)  ◄── stores (in memory) ──┐  │
                 │        │ calls                                         │  │
                 │        ▼                                               │  │
static host ───► │  Engine (Cesium Viewer) ── frame loop: input ─► camera │  │
(HTML/JS/CSS,    │    ├─ TerrariumTerrainProvider ◄─ TerrariumTileSource ─┼──┼──► s3.amazonaws.com
 Cesium assets,  │    ├─ ImageryManager ─────────────────────────────────┼──┼──► EOX, NASA GIBS, USGS, GEBCO
 geoid grid)     │    ├─ FeedLayers (pollers) ────────────────────────────┼──┼──► USGS, NASA EONET
                 │    ├─ BuildingsLayer, VectorOverlayProvider ───────────┼──┼──► OpenFreeMap
                 │    └─ MeasureLayer                                     │  │
                 │  inspection.ts ── point elevation / weather adapters ──┼──┼──► Open-Meteo, USGS EPQS, NOAA
                 │  SearchBox ── coordinate parser / Nominatim ───────────┘  │──► nominatim.openstreetmap.org
                 └───────────────────────────────────────────────────────────┘
```

## Source layout

```
src/
  app/                 App shell and the engine context
  config/
    application.ts     Static configuration (no secrets — there are none)
    providers/         Provider metadata (catalog.ts), layer definitions (layers.ts),
                       terrain source prefixes, future/rejected sources
  core/
    state/             Minimal external stores + React hook; per-viewer preferences
    net/RequestQueue   Bounded, prioritised, de-duplicating, abortable request queue
    lifecycle/poller   Refresh that pauses while the tab is hidden
    inspection.ts      Point inspection and elevation profiles
  providers/           One adapter per provider; zod-validated, normalised records
    base/              Contract types and fetch helper
  spatial/
    terrain/           Terrarium decoding, corrections, tile source, Cesium terrain provider
    geoid/             EGM96 loader and interpolation
    measurements/      GeographicLib geodesics (distance, area, densification)
    coordinates/       Parsing and formatting
    imagery/           Cesium imagery stack management
    rendering/         Engine, feed/measure/building layers, data-encoding palettes
  gamepad/             Gamepad polling, bindings, shaping, keyboard, camera motion model
  components/          React UI: panels, inspector, controls, dialogs
  styles/app.css       HUD layout from the shared design system's tokens
```

## The provider contract

Each source has **metadata** (`ProviderMetadata` in `providers/base/types.ts`) — category,
capabilities, endpoint and protocol, authentication, verified CORS, coverage, resolution,
documented accuracy, vertical datum, surface model, update characteristics, licence,
attribution, rate limits, caching and limitations — kept in
`config/providers/catalog.ts`, separate from the **adapter** in `providers/`.

Components ask for capabilities, not providers: the inspector runs every
`point-elevation` adapter whose coverage includes the point; the source dialog renders
the catalogue; the imagery manager reads layer definitions. Adapters validate responses
with zod and normalise them, keeping the provider id and the source's own record id
(`ObservationRecord.sourceRecordId`) and attribution.

## Rendering engine

`Engine` owns the Cesium `Viewer` and everything attached to it. React never touches
Cesium objects: components read stores and call engine methods.

- **Request-render mode.** Cesium renders only when something changes. Frames are
  requested while tiles load (and for 3 s after load activity, so late textures are
  drawn), while the camera moves, when data changes, and at least every 10 s of clock time
  so the Sun's light keeps moving.
- **Time and light.** The Cesium clock runs in real time. Cesium places the Sun with its
  Simon et al. (1994) series in the ICRF and rotates it into Earth-fixed coordinates with
  the IAU 2006 precession-nutation tables it ships (preloaded around the current time).
  Realistic lighting turns on Cesium's globe shading. Cesium fades that shading out within
  about 3,600 km of the ground, together with the ground atmosphere (forcing it on brings
  the atmosphere back and washes close-up views out), so a globe material
  (`rendering/daylight.ts`) applies exactly the shading Cesium leaves out at the camera's
  distance, and 3D buildings use the same term. Black Marble city lights are an imagery
  layer drawn only on the night side (Cesium's `nightAlpha`/`dayAlpha`), brightened by the
  inverse of Cesium's 30% night shading, and faded to a glow below 800 km because their
  pixels are about 500 m across. Full daylight removes all three.
- **Input loop.** A separate `requestAnimationFrame` loop samples the gamepad, keyboard and
  on-screen sticks every frame — independent of rendering — and requests a render only
  when input moves the camera.
- **Imagery resilience.** Each imagery provider's `requestImage` is wrapped: transient
  failures are retried, a 404 (no data for that date) becomes a transparent tile at once,
  and a tile that still fails becomes transparent and is counted. Without this, Cesium
  abandons a failed tile for the rest of the session.
- **Borders and place names.** `VectorOverlayProvider` is a Cesium imagery provider that
  draws OpenFreeMap vector tiles (OpenMapTiles `boundary` and `place` layers) into
  transparent tiles. Each imagery level is drawn from that zoom's data (zoom 2 is skipped
  for its ~1.1 MB tiles; beyond zoom 14 the zoom-14 tile is drawn larger), so detail is
  added and names thin out or fill in as the camera moves, at a constant text size. Labels
  are decluttered by priority, considering candidates up to half a tile beyond each edge so
  neighbouring tiles agree. Each vector tile is fetched once through a bounded queue and
  decoded once, in memory only.
- **Points of interest and water.** The place-name overlay also places points of interest
  (by group, after every place name), airports, peaks, lake names and house numbers, in one
  decluttering pass so none overlaps another. A separate water overlay draws lakes and
  tanks (seasonal ones lighter and dashed), rivers, canals and drains, with river names
  along the line.
- **Roads and building footprints.** The same provider draws OpenFreeMap roads (with names
  laid along the longest straight stretch) and Overture building footprints. Footprints
  come from Overture's PMTiles archive, read by HTTP range request with the `pmtiles`
  library, from zoom 14 inwards (`minimumTerrainLevel`).
- **Aerial photos.** National orthophoto services are overlays limited to their country's
  rectangle and to close-up terrain levels. Services that fill beyond their coverage with
  white have pure-white pixels made transparent. Cesium decodes tiles to bitmaps already
  flipped vertically, so that step undoes the flip before redrawing.
- **Live clouds.** `CloudLayer` keeps one imagery layer per hourly frame (the last four
  hours). Each frame's `CloudFrameProvider` stitches the five geostationary satellites by
  longitude and turns infrared brightness temperature into white cloud opacity. Every
  frame loads at opacity 0; Cesium loads but does not draw such layers. The input loop
  crossfades between frames that are at least 80% loaded, at 15 updates a second, so the
  globe renders only while frames change. Clouds fade out between 1 500 km and 150 km
  altitude, and hold the newest frame in low-performance mode.
- **Cloud shadows.** Under realistic lighting each frame also has a `CloudShadowProvider`
  layer, beneath every cloud layer and crossfaded with its frame. Each pixel takes the cloud
  whose shadow falls on it: towards the Sun at the frame's time, by the cloud top's height
  over the tangent of the Sun's elevation. The height comes from the cloud-top temperature
  through the standard atmosphere, found in two steps because it depends on the cloud being
  looked for. It reads the frame's own decoded source tiles (and neighbours where a shadow
  crosses an edge), so it adds no new kind of request, and it draws from level 4 down,
  where an offset of tens of kilometres is more than a pixel.

## Terrain pipeline

```
Cesium asks for geographic tile (x, y, L)
  └─ TerrariumTerrainProvider.requestTileGeometry
       ├─ geoid still loading? → decline (Cesium retries)
       ├─ queue full and tiles not cached? → decline (back-pressure)
       └─ Mercator tiles at zoom L−1 covering the tile
            └─ TerrariumTileSource.load  ── RequestQueue (6 concurrent, priority, de-dup, abort)
                 ├─ fetch PNG, read x-amz-meta-x-imagery-sources and Last-Modified
                 ├─ createImageBitmap(colorSpaceConversion: 'none') → canvas → decode
                 ├─ corrections (ArcticDEM datum, ice surface, sea-level fill)
                 └─ in-memory LRU (160 decoded tiles ≈ 40 MB)
       └─ resample 65×65, add EGM96 N → HeightmapTerrainData (ellipsoidal)
```

Every 0.5 s, queued or running terrain fetches for tiles outside the camera's view
rectangle (+2°) are aborted, unless they serve a user request (inspection, profile, at
priority ≥ 100). Aborted Cesium requests are marked `CANCELLED`, so Cesium asks again only
if the tile is still needed. Transient failures are retried twice via the provider's
`errorEvent`; a tile that still fails leaves Cesium showing the coarser parent there.

Beyond Terrarium zoom 15 (geographic level 16) Cesium upsamples the parent mesh — smooth
interpolation, not synthetic detail.

## State

`core/state/appState.ts` defines small stores split by update rate: `layersStore`,
`feedsStore`, `cameraStore` (published at ≤ 10 Hz), `statusStore`, `selectionStore`,
`uiStore`, and `gamepadStore`. `useStore` subscribes a component to a slice and re-renders
only when that slice changes (shallow comparison).

**Persistence.** Only the reader's own preferences — base layer, enabled overlays (and the
overlays offered when they were saved, so overlays added later start at their defaults),
day/night lighting, low-performance mode, controller profile — are written, to `localStorage` key
`continuum.preferences.v1`, with every access guarded. Provider data is never written to
any storage. The shared design system keeps the ecosystem theme in its own `hk.*` key and
a `.harithkavish.com` cookie. An end-to-end test asserts this.

## Design system

The page loads the shared design system from its home
(`https://harithkavish.com/design-system/`): tokens, base, the `<harith-header>` shell,
`theme-toggle.js` and `harith-store.js`. Continuum's HUD components are product surfaces
composed from those tokens and the system's `.button`, `.pill` and `.status-dot` classes.
Declared deviations are listed in [GOVERNANCE.md](../GOVERNANCE.md). The design-system
scripts are loaded without subresource-integrity hashes on purpose: every surface consumes
the live shared system, and pinning a hash would break Continuum on each release of it.

## Performance

| Measure | Value (production build) |
|---|---|
| Initial JS (app, React, providers) | 467 KB (145 KB gzip) |
| Engine chunk (CesiumJS), loaded lazily | 4.2 MB (1.13 MB gzip) |
| EGM96 grid | 937 KB, loaded once |
| Decoded terrain cache | ≤ 160 tiles (~40 MB) |
| Idle cost | One frame per 10 s of clock time (the Sun moves); feeds paused when the tab is hidden |

Low-performance mode lowers the resolution scale, uses coarser terrain
(`maximumScreenSpaceError` 4) and disables MSAA.

## The solar system

`spatial/space/` places the Sun, the Moon and the planets around Cesium's globe, which
stays Earth itself. Cesium's world frame is Earth-fixed, so every body is computed in the
ICRF and turned into that frame each tick with the same ICRF→Earth rotation Cesium lights
the globe with (IAU 2006 tables, preloaded for the clock's date).

- **Positions** (`ephemeris.ts`, pure): JPL's approximate Keplerian elements for Mercury to
  Neptune and the Earth–Moon barycentre (Table 1 for 1800–2050, Tables 2a/2b otherwise),
  solved as JPL describes; Pluto from Horizons osculating elements, two-body. The Sun and
  the Moon come from Cesium's Simon et al. (1994) series, so the Sun drawn is exactly
  where the globe is lit from; a planet's geocentric position is its heliocentric one
  plus the Sun's.
- **Orientation** (`orientation.ts`, pure): IAU 2015 pole and prime-meridian models from
  pck00011, including Mars's and Neptune's periodic terms; the Moon uses Cesium's IAU Moon
  model. A body's model matrix is Earth-fixed ← ICRF ← body-fixed.
- **Drawing** (`SolarSystem.ts`): an ellipsoid primitive per body with a material lit by
  the real direction of the Sun from that body (the Sun itself glows with limb
  darkening), Saturn's rings as a translucent annulus from NASA's ring values, and orbit
  lines sampled from the same positions over one period and rebuilt when the clock has
  moved 1% of it (their model matrix carries the Sun's position, so they cost a uniform
  per frame). Maps are fetched once a body covers a few pixels. Points and names sit on
  the line of sight 10 000 km from the camera: Cesium garbles text drawn more than about
  10¹² m away.
- **Navigation** (`SpaceCamera.ts`, `SpacePointer.ts`): the camera orbits the focused body
  in ICRF axes, so the body turns beneath it at its real rate, and follows it. Flights
  interpolate the offset from the target in direction (slerp) and log-distance. Cesium's
  mouse controller works in Earth-fixed axes, so it is switched off in space and pointer,
  wheel and pinch input drive the orbit instead. Scrolling out past the highest Earth view
  enters space around Earth; orbiting Earth closer than 2.2 radii hands back.
- **Time.** The clock runs between 1900 and 2100, from real time to 30 days a second;
  lighting, bodies and orbits all follow it. The Earth layers (clouds, imagery) do not.
