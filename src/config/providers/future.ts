// Sources investigated but not integrated, and why (see docs/DATA_SOURCES.md).

export const FUTURE_SOURCES: { name: string; reason: string }[] = [
  {
    name: 'Copernicus DEM GLO-30 / GLO-90 (direct)',
    reason:
      'Copernicus Data Space downloads need registration. The public AWS copies (copernicus-dem-30m) send no CORS headers, so a browser cannot read them. GLO-90 point values are available through Open-Meteo instead.',
  },
  {
    name: 'Cesium World Terrain, Cesium OSM Buildings, Bing imagery (Cesium ion)',
    reason: 'Require a Cesium ion access token.',
  },
  {
    name: 'OpenSky Network aircraft states',
    reason:
      'Anonymous REST access works, but the API only allows its own origin (CORS), so browsers elsewhere are refused.',
  },
  {
    name: 'NASA FIRMS active fire API',
    reason:
      'Needs a MAP_KEY. The same detections are shown visually through GIBS thermal-anomaly layers in a later release.',
  },
  {
    name: 'OpenTopography global DEM API',
    reason: 'Needs an API key.',
  },
  {
    name: 'Open Topo Data public API',
    reason: 'No CORS headers on responses; a browser cannot read them.',
  },
  {
    name: 'OpenStreetMap standard tiles (tile.openstreetmap.org)',
    reason:
      'Usage policy discourages applications using it as a default layer; OSM data reaches Continuum through NASA GIBS reference layers and OpenFreeMap instead.',
  },
  {
    name: 'Esri World Imagery',
    reason:
      'Tiles respond to browsers, but production use is governed by Esri terms that expect an ArcGIS account.',
  },
  {
    name: 'Stadia / MapTiler / Thunderforest basemaps',
    reason: 'Require an API key or domain registration.',
  },
  {
    name: 'Moon, Mars and planetary terrain (NASA Trek WMTS)',
    reason: 'Planned for the beyond-Earth phase; not yet evaluated for browser access.',
  },
];
