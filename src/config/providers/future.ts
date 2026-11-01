// Sources investigated but not integrated, and why (see docs/DATA_SOURCES.md).

export const FUTURE_SOURCES: { name: string; reason: string }[] = [
  {
    name: 'ISRO Bhuvan WMS and tile cache (India)',
    reason:
      'Both answer (bhuvan-vec1 WMS, bhuvan-ras2 tile cache) but send no CORS headers (checked 2026-11-01), so a browser on another site cannot read them. OpenStreetMap data covers the same roads, water and places.',
  },
  {
    name: 'Bharatmaps (NIC, India)',
    reason:
      'Its certificate chain did not verify against the Mozilla root store (SELF_SIGNED_CERT_IN_CHAIN, checked 2026-11-01); not evaluated further.',
  },
  {
    name: 'TN-GIS (Tamil Nadu e-Governance Agency)',
    reason:
      'Its layers and Web API services sit behind an official or public account login, and its map viewer asks for GeoServer credentials (checked 2026-11-01).',
  },
  {
    name: 'Overture Maps places',
    reason:
      'Browser-accessible and CDLA-Permissive-2.0, but heavy where it is densest: a zoom-14 tile over central Chennai is 4.3 MB (5 356 places), over Madurai 3.1 MB (3 857) (checked 2026-11-01). Points of interest come from OpenStreetMap instead, at about a tenth of the size.',
  },
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
      'Usage policy discourages applications using it as a default layer; OSM data reaches Continuum through OpenFreeMap vector tiles instead.',
  },
  {
    name: 'EUMETSAT Meteosat imagery every 15 minutes',
    reason:
      'Under EUMETSAT’s data policy, 15-minute imagery is free only three hours after sensing, while hourly imagery is free in real time. The live clouds use hourly frames.',
  },
  {
    name: 'RainViewer satellite infrared',
    reason:
      'The public weather-maps feed lists no satellite frames any more (checked 2026-11-01); only radar remains.',
  },
  {
    name: 'GSI Japan seamless aerial photos (地理院タイル)',
    reason:
      'Browser-accessible (CORS *), but the terms may require an approval application when a map is a site’s main content, as it is here. Not integrated until that is clarified.',
  },
  {
    name: 'IGN Spain PNOA orthophotos',
    reason:
      'Browser-accessible and CC BY 4.0, but beyond Spain the service returns a low-detail fill (e.g. over Portugal) that would cover the Sentinel-2 imagery there.',
  },
  {
    name: 'OpenAerialMap mosaic (Kontur)',
    reason: 'The mosaic tile server (apps.kontur.io) did not accept connections when tested.',
  },
  {
    name: 'NASA GIBS Reference_Labels and Reference_Features (raster, OpenStreetMap)',
    reason:
      'Used in v0.1.0, then replaced. The tiles stop at zoom 9 and are only magnified beyond it, so names grow and never thin out as you zoom in, and borders stay coarse. The 15 m variants returned opaque black tiles and HTTP 500s. Borders and place names now come from OpenFreeMap vector tiles, drawn for each zoom.',
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
