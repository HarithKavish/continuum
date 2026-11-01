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
                 │    ├─ BuildingsLayer ──────────────────────────────────┼──┼──► OpenFreeMap
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
  drawn), while the camera moves, and when data changes.
- **Input loop.** A separate `requestAnimationFrame` loop samples the gamepad, keyboard and
  on-screen sticks every frame — independent of rendering — and requests a render only
  when input moves the camera.
- **Imagery resilience.** Each imagery provider's `requestImage` is wrapped: transient
  failures are retried, a 404 (no data for that date) becomes a transparent tile at once,
  and a tile that still fails becomes transparent and is counted. Without this, Cesium
  abandons a failed tile for the rest of the session.

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

**Persistence.** Only the reader's own preferences — base layer, enabled overlays,
low-performance mode, controller profile — are written, to `localStorage` key
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
| Idle cost | No rendering; feeds paused when the tab is hidden |

Low-performance mode lowers the resolution scale, uses coarser terrain
(`maximumScreenSpaceError` 4) and disables MSAA. The status bar shows rendered frames per
second (zero when idle, by design) and the JavaScript heap where the browser exposes it.

## Extending beyond Earth

Cesium supports arbitrary ellipsoids, so Moon and Mars terrain fit the same provider
contract (a `TerrainProvider` with a different `Ellipsoid`, imagery from NASA Trek WMTS once
verified). The catalogue records them as planned, not yet evaluated.
