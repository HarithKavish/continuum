# Continuum

Continuum is a browser-native spatial exploration environment: an interactive 3D Earth
built from real, publicly accessible data — terrain, satellite imagery, bathymetry,
buildings and natural events — explorable from orbit to street level with mouse, keyboard,
touch or a gamepad. It runs entirely in the browser: no backend, no accounts, no API keys,
and nothing fetched is stored.

- **Live:** https://continuum.harithkavish.com
- **Ecosystem:** part of the HarithKavish ecosystem — see [GOVERNANCE.md](GOVERNANCE.md)
  and [AGENTS.md](AGENTS.md).

> *Represent reality using real data. Preserve its provenance. Make it explorable at every scale.*

## Run it

```
pnpm install
pnpm dev          # http://localhost:5173
```

`pnpm build` writes the static site to `dist/`; `pnpm preview` serves it. Node 22 and pnpm
are the only requirements. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for tests and
scripts.

## What it does

- **Real terrain** from the Terrain Tiles composite DEM (SRTM, USGS 3DEP, ArcticDEM, ETOPO1
  and national datasets), streamed by level of detail, converted to WGS84 ellipsoidal
  heights with EGM96, with source-specific corrections found by testing the live data.
- **Imagery**: Sentinel-2 cloudless (10 m), NASA GIBS daily MODIS and VIIRS with a date
  picker, Blue Marble, Black Marble, USGS orthoimagery, and national aerial photos (8–30 cm)
  of France, the Netherlands, Switzerland and Austria; overlays for coastlines, surface
  water, floods, GEBCO 2026 bathymetry, sea-surface temperature and precipitation.
- **Map detail drawn for each zoom**: country, state and district borders and place names
  (OpenStreetMap via OpenFreeMap), roads with street names, and building footprints from
  Overture Maps (OpenStreetMap with Google and Microsoft machine-detected buildings).
- **Live clouds**: infrared from five geostationary satellites (EUMETSAT Meteosat, NASA GIBS
  GOES and Himawari), looping the last four hours.
- **Day and night**: the globe is lit from where the Sun is right now, at every distance, with
  NASA Black Marble city lights on the night side; one button (or L) switches to full
  daylight.
- **3D buildings** from OpenStreetMap (OpenFreeMap vector tiles) near the ground.
- **Live events**: USGS earthquakes (every minute) and NASA EONET natural events.
- **Inspector**: coordinates, orthometric and ellipsoidal heights, geoid undulation, the
  exact source files under the point with their datum, model and documented accuracy,
  slope, independent elevations (Copernicus GLO-90, USGS 3DEP, NOAA), and current weather.
- **Measurement**: geodesic distance and area on the WGS84 ellipsoid, elevation profiles.
- **Navigation**: dual-stick gamepad with calibration and rebinding, keyboard, touch sticks.
- **Sources**: every provider's licence, attribution, coverage, accuracy and limits, in the
  app and in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Documentation

| | |
|---|---|
| [docs/RESEARCH.md](docs/RESEARCH.md) | Provider research, measured findings, rejected alternatives |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | The provider catalogue |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built |
| [docs/ACCURACY.md](docs/ACCURACY.md) | Datums, accuracy and the corrections applied |
| [docs/GAMEPAD.md](docs/GAMEPAD.md) | Controller, keyboard and touch navigation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting and release |
| [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) | Acceptance results and open items |

3D rendering by [CesiumJS](https://cesium.com/platform/cesiumjs/) (Apache 2.0). Data
attribution is shown on the globe and in the Sources dialog.
