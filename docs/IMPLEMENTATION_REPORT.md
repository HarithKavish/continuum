# Implementation report — v0.1.0

Acceptance status of Continuum's first version against the original brief, with the
evidence for each item. Date: 2026-11-01. Branch: `feature/claude` (pull request into
`development`).

**Summary.** The application is built, tested and committed. It renders a real 3D Earth
from public data in the browser, with no backend, accounts, keys or stored provider data.
It is **not yet live**: deployment is wired as a committed workflow on `main`, but
publishing needs owner actions (listed at the end) that no agent credential here may take.

## How it was verified

| Check | Result |
|---|---|
| `pnpm typecheck` (strict) | Pass |
| `pnpm lint` | Pass |
| `pnpm format` | Pass |
| `pnpm test` — 62 unit tests, 5 files | Pass |
| `pnpm build` | Pass — 14 MB static artifact |
| `pnpm test:e2e` — 23 browser tests, production build, live providers | Pass (23/23, 5.7 min) |
| Browser endpoint probe (`tools/probe-endpoints.mjs`) | All integrated endpoints pass from a third-party origin |

End-to-end tests run the production build in Chromium with a software GPU (SwiftShader)
against the live providers. A physical gamepad and a hardware GPU were not available in
this environment; the controller is emulated through `navigator.getGamepads`.

## Acceptance criteria

### Globe

| Criterion | Status | Evidence |
|---|---|---|
| Real Earth globe renders | Pass | e2e "renders real terrain and imagery…"; visual checks at global, Himalaya and city scale |
| Camera works | Pass | e2e camera tests; mouse via Cesium |
| Terrain source is genuine | Pass | e2e asserts the scene uses `TerrariumTerrainProvider`, not the ellipsoid; terrain tiles delivered |
| Imagery source is genuine | Pass | e2e asserts successful EOX tile responses |
| Geographic coordinates correct | Pass | Unit tests: tile maths, parsing, GeographicLib reference values; e2e inspection at known points |

### Terrain

| Criterion | Status | Evidence |
|---|---|---|
| Elevation tiles load where available | Pass | Zoom 0–15 streamed; finest tile shown in the panel |
| Height decoding correct | Pass | Unit tests on the encoding; Everest tile max 8 753 m measured live |
| Missing tiles handled | Pass | 404/5xx retried, then Cesium keeps the coarser parent; failures counted in the status bar |
| No fake high-resolution terrain | Pass | Requests stop at zoom 15; Cesium upsamples beyond; polar caps reported as no data |
| Terrain and imagery aligned | Pass | Both on WGS84; terrain converted to ellipsoidal with EGM96 (unit-tested against NGA-tested reference to 6 mm) |
| *Found and fixed:* sea-level fill, ice-sheet bedrock, ArcticDEM datum | Pass | Unit tests; e2e Challenger Deep < −9 000 m; e2e Reykjavík < 40 m (raw tile 78 m) |

### Data sources

| Criterion | Status | Evidence |
|---|---|---|
| Earthquake feed loads | Pass | e2e: normalised USGS records with source ids and attribution |
| NASA EONET loads | Pass | e2e |
| Imagery loads | Pass | e2e; probe |
| Bathymetry layer works | Pass | GEBCO 2026 WMS probe; terrain carries ETOPO1 seabed; NOAA point depth |
| Geographic features load | Pass | GIBS reference labels/features (OSM); OpenFreeMap buildings (visual check in Manhattan) |
| Source attribution visible | Pass | e2e asserts credits on screen; Sources dialog e2e |

### Gamepad

| Criterion | Status | Evidence |
|---|---|---|
| Controller detection | Pass | e2e (emulated standard mapping) |
| Left stick pans | Pass | e2e |
| Right stick rotates and tilts | Pass | e2e, including tilt clamp |
| Triggers zoom | Pass | e2e |
| Buttons work (A, B, X, Y, LB, RB, Start) | Pass | e2e |
| Dead zone works | Pass | e2e (no movement inside it); unit tests |
| Disconnect works | Pass | e2e (no errors) |
| Keyboard and mouse remain functional | Pass | e2e keyboard; Cesium mouse controller unchanged |
| Rebinding and calibration | Pass | e2e rebinding survives reload; unit tests for calibration |
| Physical controller | **Not verified** | No hardware here |

### Accuracy

| Criterion | Status | Evidence |
|---|---|---|
| Coordinate inspector works | Pass | e2e |
| Elevation source identifiable | Pass | e2e asserts the SRTM source file and its datum at Everest |
| Vertical datum not fabricated | Pass | Shown per source file; "not stated" where undocumented |
| Accuracy not confused with grid spacing | Pass | e2e asserts "not the source resolution" label |
| Geodesic distance and area | Pass | e2e 1° of longitude = 111 km; area 1.23 km²; unit tests |
| Elevation profile | Pass | e2e across the Bernese Alps (max > 2 500 m) |

### Architecture

| Criterion | Status | Evidence |
|---|---|---|
| No backend runtime | Pass | Static build only; deploy workflow publishes `dist/` |
| No database | Pass | — |
| No mandatory login | Pass | — |
| No private credentials | Pass | Secret scan of the commit; e2e host allow-list |
| No permanent data storage | Pass | e2e: only preference keys in localStorage, nothing in sessionStorage or IndexedDB |
| Requests originate in the browser | Pass | e2e: every request goes to the app, the design system, or a catalogued provider |

### Deployment

| Criterion | Status | Evidence |
|---|---|---|
| Production build succeeds | Pass | `pnpm build` |
| Repository contains the implementation | Pass | `HarithKavish/continuum`, branch `feature/claude` |
| Production URL works | **Not done** | Pages not enabled, DNS record not created, work not yet promoted to `main` |
| HTTPS | **Not done** | Follows from the above |
| No critical console errors | Pass | e2e asserts no page errors on load |

## Problems found and fixed during verification

1. **Terrain:** sea-level fill at zoom ≥ 11 over parts of the ocean, ETOPO1 *bedrock* under
   ice sheets, and ellipsoidal ArcticDEM heights — all measured on live tiles and corrected
   with real data, flagged per pixel ([ACCURACY.md](ACCURACY.md)).
2. **Imagery:** NASA GIBS `Reference_Labels_15m`/`Reference_Features_15m` returned opaque
   black tiles and HTTP 500s, blanking whole regions; replaced by the reliable zoom-9
   layers, and every imagery provider now retries and degrades to a transparent tile.
3. **Rendering:** in request-render mode, tiles finishing after the last frame were never
   drawn; frames are now requested during and shortly after tile activity.
4. **Attribution:** imagery credits were initially created off-screen and then clipped by
   layout; both fixed and asserted by a test.
5. **Geoid asset:** a static server sent the gzip file with `Content-Encoding: gzip`;
   loading now handles both encodings and degrades (flagged) if the grid fails.
6. **Navigation:** smoothing used a capped time step, so below 10 fps the camera kept
   gliding after release; smoothing now uses real elapsed time (unit-tested at 5 and
   120 fps).
7. **Out-of-view work:** view-based pruning aborted elevation-profile requests for paths
   outside the view, leaving the profile stuck; user-requested work is now exempt and
   unexpected aborts are reported.
8. **Measurement:** a clockwise polygon reported the area of the rest of the Earth; area is
   now winding-independent (unit test).

## Known limitations

- Terrain Tiles is a 2017 product with mixed, unharmonised vertical datums; most land is
  SRTM at ~30 m. Polar caps beyond ±85.05° have no terrain data.
- The ice-surface and bathymetry corrections use coarse ancestor tiles (zoom 3 and
  zoom ≤ 10); ArcticDEM conversion also affects other sources merged into the same tile.
- 3D building heights are often OpenMapTiles estimates where OSM has no height tags;
  buildings are hidden when vertical exaggeration is on.
- Labels are raster (GIBS, zoom 9) — not searchable or selectable.
- EOX Sentinel-2 cloudless and the Open-Meteo free tier are licensed for non-commercial
  use only.
- No aircraft, maritime, Moon or planetary layers yet (see the catalogue's
  "not integrated" list for why).
- The initial bundle includes CesiumJS (1.13 MB gzip) and the geoid grid (0.94 MB).
- Under a software GPU the globe renders at a few frames per second; real GPUs are needed
  for smooth use. A physical controller has not been tested.
- Agent commits are unsigned: creating a signing key was not permitted in this session.

## Outstanding manual actions (owner)

1. **Repository visibility** — created private; make it public if intended
   (`gh repo edit HarithKavish/continuum --visibility public --accept-visibility-change-consequences`).
2. **Automated review** — set the `CLAUDE_CODE_OAUTH_TOKEN` repository secret so
   `claude-review.yml` runs and the required `gate` check can pass.
3. **Merge and promote** — review and merge the pull request into `development`, then
   promote `development` → `runway` → `main` by pull request. `main` publishes.
4. **Enable GitHub Pages** with the workflow build type and the custom domain
   `continuum.harithkavish.com` ([DEPLOYMENT.md](DEPLOYMENT.md#one-time-setup-owner-actions)).
5. **Cloudflare DNS** — add `CNAME continuum → harithkavish.github.io` (proxied), nothing
   else. The name does not resolve today.
6. **Social preview** — upload `.github/social-preview.png` in repository settings.
7. **Ecosystem registry** — a branch `feature/claude-register-continuum` with the registry
   entry was pushed to `harithkavish-governance`; opening its pull request was not
   permitted from this session.
8. **Commit signing** — provision a signing key for agent commits if signatures are to be
   verified.
9. **After going live** — run `PLAYWRIGHT_BASE_URL=https://continuum.harithkavish.com pnpm test:e2e --workers=1`.
