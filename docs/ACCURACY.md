# Accuracy and reference systems

What Continuum's numbers mean, how good they are, and where they are not good at all.
The rule throughout: a value is shown only with its source, and anything a provider does
not document is shown as *not stated* — never estimated.

## Reference systems

| Quantity | Reference | Notes |
|---|---|---|
| Horizontal coordinates | WGS84 geographic, EPSG:4326, degrees | Displayed to 5 decimals (~1 m) as display precision only |
| Rendering surface | WGS84 ellipsoid | Cesium's globe; terrain heights are converted to ellipsoidal |
| Displayed elevation | Orthometric (≈ above mean sea level) | As delivered by the source DEM, after the corrections below |
| Geoid | EGM96, NGA 15′ grid, bilinear | h = H + N |
| Distance and area | WGS84 ellipsoid, GeographicLib geodesics | Metres, square metres |
| Time | ISO 8601, UTC | Displayed as `YYYY-MM-DD HH:MM UTC` |

### Heights are three different things

- **Orthometric height H** — height above the geoid, approximately "above mean sea level".
  This is what the DEMs deliver and what the inspector shows first.
- **Ellipsoidal height h** — height above the WGS84 ellipsoid. h = H + N. Cesium renders on
  the ellipsoid, so every terrain vertex is converted.
- **Geoid undulation N** — the geoid's height above the ellipsoid: −106 m south of India,
  +85 m near Iceland. Ignoring it would misplace the terrain by up to ~100 m vertically.

The inspector shows all three. A value below zero is labelled *below sea level* — seabed
depth or a land depression; the terrain source does not say which, so Continuum does not
either.

**Vertical datums are not harmonised by the terrain producer.** SRTM and GMTED2010 use
EGM96; USGS 3DEP uses NAVD88; ETOPO1 uses sea level; national datasets use national datums
(the inspector names the datum of each source file under a point). Differences between
these reach a few metres in places. Continuum does not attempt datum transformations it
lacks the models for; it applies EGM96 uniformly, which is exact for SRTM and GMTED2010 and
approximate elsewhere.

## Terrain: resolution is not accuracy

The Terrain Tiles grid at zoom 15 has 4.8 m × cos(latitude) pixels. That is the spacing of
the **tiles**, not the resolution of the **data**: most of the world is SRTM at ~30 m,
oversampled. The inspector labels tile grid spacing explicitly as "not the source
resolution" and lists each source dataset with its own native resolution.

Documented accuracy of the main sources (from their producers):

| Source | Vertical accuracy | Reference |
|---|---|---|
| SRTM | Specification: 16 m absolute (90% linear error); horizontal 20 m (90% circular) | NASA SRTM |
| GMTED2010 (7.5″) | RMSE 26–30 m | USGS OFR 2011-1073 |
| USGS 3DEP ⅓″ | RMSE 1.55 m | USGS SIR 2014-5008 |
| EU-DEM v1.0 | RMSE 2.9 m | EU-DEM validation report |
| ETOPO1, ArcticDEM, national DEMs | Not stated in a single figure | Shown as "Not documented" |
| Copernicus DEM (via Open-Meteo) | < 4 m LE90 (GLO-30 specification) | Copernicus |

Example: at Mount Everest the highest zoom-12 pixel is 8 753 m against a surveyed summit
of 8 848.86 m — SRTM's radar grid smooths sharp peaks.

## Source corrections Continuum applies

All three were discovered by sampling the live tiles ([RESEARCH.md §2](RESEARCH.md#terrain-findings-measured)).
Each uses real data from the same product; replaced or converted pixels are marked in a
per-tile mask and the inspector says what happened at the selected point.

1. **Sea-level fill → bathymetry.** Where a zoom ≥ 11 tile has no ETOPO1 source and a pixel
   is exactly 0 m, the value is taken from the nearest ancestor tile (zoom 10 → 6) that does
   include ETOPO1, if that value is below sea level. The seafloor is then shown at ETOPO1's
   1′ (~1.85 km) resolution instead of disappearing. Coastal land at exactly 0 m stays 0 m
   because its ancestor is not below sea level.
2. **Bedrock → ice surface.** Applies only to tiles whose sole source is ETOPO1, inside
   Antarctica (south of 60°S) and Greenland. Greenland's region is bounded by the straits
   to Canada and excludes Iceland; elsewhere ETOPO1 already carries the surface. A pixel
   takes the zoom-3 tile's GMTED2010 surface only when every zoom-3 sample within 3 pixels
   is above sea level and more than 50 m above it. This restores the ice sheet at mid zooms,
   at coarse resolution (zoom-3 pixels are ~4 km at 78°S). Seafloor, coasts, fjords and
   ice-free land keep their ETOPO1 values. Measured on live tiles, ice-free west Greenland
   has 0–61 pixels raised per zoom-8 tile. The cost is that ice within about 3 zoom-3 pixels
   of the ice edge (~5–30 km, depending on latitude) keeps ETOPO1 bedrock at zooms 5–10.
3. **ArcticDEM datum.** In tiles that contain ArcticDEM (`pgdc_5m`), land pixels are
   converted from ellipsoidal to orthometric (H = h − N). A tile can merge ArcticDEM with
   other sources and does not say which pixel came from which, so other land pixels in such
   tiles are converted too — an error of up to N (~30–70 m) on those pixels. Flagged in the
   inspector.

Slope is not computed at a point whose value came from a coarser tile (it would mix two
resolutions).

**Fixed 2026-11-01: source-tile edges.** Rendered terrain tiles are resampled from Web
Mercator source tiles. A sample exactly on a source-tile edge could round into the
neighbouring tile, which had not been requested, and was then given 0 m. That lowered the
whole edge, cutting a narrow trench in the rendered surface: a white north–south line in
close-up views (seen over France). The point inspector and elevation profile read source
tiles directly and were not affected. Edge samples now use the requested tile that holds
that edge.

## Coverage limits

- **Polar caps beyond ±85.05°** have no Terrain Tiles data (Web Mercator). For rendering,
  the last row of data is extended across the cap; the inspector reports these points as
  having no terrain data rather than quoting the fill.
- **Above zoom 15** Cesium upsamples the parent mesh: the surface gets smoother, not more
  detailed.
- **Terrain off** shows the bare WGS84 ellipsoid, and the panel says so.

## Measurements

Distances and areas are computed on the WGS84 ellipsoid with GeographicLib (Karney 2013):
geodesic distances to nanometres, areas to square millimetres per vertex — far below any
data error. They are along the ellipsoid, ignoring relief (stated in the panel). One
degree of longitude on the equator measures 111.319 km; one degree of latitude there
110.574 km — tested. Area is reported regardless of the drawing direction.

The **elevation profile** samples 256 points along the geodesic path from the tile zoom
whose grid best matches the sample spacing, and states that zoom and spacing; features
narrower than the grid are smoothed away.

## Point sources compared

The inspector queries independent sources and shows them side by side, because they
disagree for real reasons:

| Source | Model | Datum | Where |
|---|---|---|---|
| Terrain Tiles | Mixed (see above) | Mixed | Global |
| Copernicus DEM GLO-90 (Open-Meteo) | DSM — includes buildings and canopy | EGM2008 | Global |
| USGS 3DEP (EPQS) | DTM — bare earth | NAVD88 | United States |
| NOAA NCEI DEM mosaic | Topography–bathymetry | Not reported per point | Global |

## Events

- **Earthquakes**: epicentres to three decimals (~110 m) as display precision; actual
  location errors are per event and often kilometres. Depth reference depends on the
  network (NEIC: WGS84 geoid). The hypocentre line on the globe is drawn from the
  ellipsoid surface, so it is approximate by up to N.
- **EONET**: the latest reported geometry of each open event; geometry dates default to
  00:00 UTC when the source gives no time.

## Day and night

The Sun's direction is Cesium's: the Simon et al. (1994) analytical series for the
Earth–Moon barycentre, rotated from the ICRF to Earth-fixed axes with the IAU 2006
precession-nutation model. UT1 is taken as UTC
(at most 0.9 s, so the terminator is at most about 0.004° of longitude out), and the
direction is to the Sun's centre, without refraction. Shading uses
Cesium's term: full light once the Sun is about 8° above the horizon, 30% at night, on a
sphere rather than the terrain. Twilight is therefore approximate. Black Marble lights are a
2016 composite, not tonight's lights, at 500 m resolution.

## Precision shown

Elevations are shown in whole metres (the best sources are decimetre-scale; most are
metres to tens of metres), geoid undulation to 0.1 m, grid spacing to 0.1 m, coordinates to
5 decimals with an explicit note that this is display precision.
