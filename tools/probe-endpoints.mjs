// Browser CORS probe for every candidate provider endpoint.
//
// Loads a blank page at a third-party origin (http://continuum-probe.test) in Chromium and
// exercises each endpoint the way the app would: fetch() for data, and <img crossOrigin>
// plus a canvas read-back for tiles (a tainted canvas means the tile cannot be used as a
// WebGL texture). A successful curl request does not establish browser access; this does.
//
// Usage: node tools/probe-endpoints.mjs [output.json]
// Requires Playwright's Chromium (pnpm exec playwright install chromium).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const d = day(2);
const weekAgo = day(8);
const gibs = (path) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${path}`;
const terrarium = (t) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${t}.png`;

// [kind, id, url, status] — status records the integration decision for the report.
const probes = [
  // Terrain
  ['img', 'aws-terrarium-z0', terrarium('0/0/0'), 'integrated'],
  ['img', 'aws-terrarium-z12-everest', terrarium('12/3037/1716'), 'integrated'],
  ['img', 'aws-terrarium-z15', terrarium('15/24063/13729'), 'integrated'],
  ['fetch', 'aws-terrarium-sources-header', terrarium('12/3037/1716'), 'integrated'],
  [
    'img',
    'aws-normal-z1',
    'https://s3.amazonaws.com/elevation-tiles-prod/normal/1/1/0.png',
    'not used',
  ],
  [
    'fetch',
    'aws-geotiff-z1',
    'https://s3.amazonaws.com/elevation-tiles-prod/geotiff/1/1/0.tif',
    'not used',
  ],
  [
    'range',
    'aws-skadi',
    'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N27/N27E086.hgt.gz',
    'not used',
  ],
  [
    'range',
    'copernicus-dem-30-cog',
    'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N27_00_E086_00_DEM/Copernicus_DSM_COG_10_N27_00_E086_00_DEM.tif',
    'future (no CORS)',
  ],
  [
    'range',
    'copernicus-dem-90-cog',
    'https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_N27_00_E086_00_DEM/Copernicus_DSM_COG_30_N27_00_E086_00_DEM.tif',
    'future (no CORS)',
  ],
  // Imagery
  ['fetch', 'gibs-3857-capabilities', gibs('1.0.0/WMTSCapabilities.xml'), 'integrated'],
  [
    'img',
    'gibs-modis-terra',
    gibs(
      `MODIS_Terra_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/3/3/4.jpg`,
    ),
    'integrated',
  ],
  [
    'img',
    'gibs-viirs-noaa20',
    gibs(
      `VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/3/3/4.jpg`,
    ),
    'integrated',
  ],
  [
    'img',
    'gibs-bluemarble-bathy',
    gibs('BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/2/1/2.jpeg'),
    'integrated',
  ],
  [
    'img',
    'gibs-black-marble',
    gibs('VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/2/1/2.png'),
    'integrated',
  ],
  [
    'img',
    'eox-s2cloudless-2025-wgs84',
    'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/WGS84/3/2/11.jpg',
    'integrated',
  ],
  [
    'fetch',
    'eox-capabilities',
    'https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml',
    'integrated',
  ],
  [
    'img',
    'usgs-imagery-only',
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/5/12/9',
    'integrated',
  ],
  [
    'img',
    'esri-world-imagery',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/4',
    'rejected (terms)',
  ],
  // Geography and labels
  [
    'img',
    'gibs-reference-labels',
    gibs('Reference_Labels/default/GoogleMapsCompatible_Level9/4/6/11.png'),
    'integrated',
  ],
  [
    'img',
    'gibs-reference-labels-15m',
    gibs('Reference_Labels_15m/default/GoogleMapsCompatible_Level13/2/1/2.png'),
    'rejected (opaque tiles, HTTP 500)',
  ],
  [
    'img',
    'gibs-reference-features',
    gibs('Reference_Features/default/GoogleMapsCompatible_Level9/4/6/11.png'),
    'integrated',
  ],
  [
    'img',
    'gibs-coastlines-15m',
    gibs('Coastlines_15m/default/GoogleMapsCompatible_Level13/4/6/11.png'),
    'integrated',
  ],
  ['fetch', 'openfreemap-tilejson', 'https://tiles.openfreemap.org/planet', 'integrated'],
  [
    'openfreemap-tile',
    'openfreemap-vector-tile-z14',
    'https://tiles.openfreemap.org/planet',
    'integrated',
  ],
  [
    'img',
    'osm-standard-tiles',
    'https://tile.openstreetmap.org/3/4/3.png',
    'rejected (usage policy)',
  ],
  [
    'img',
    'carto-labels',
    'https://a.basemaps.cartocdn.com/dark_only_labels/3/4/3.png',
    'not used (NC quota)',
  ],
  ['img', 'opentopomap', 'https://a.tile.opentopomap.org/3/4/3.png', 'not used'],
  // Hydrology, ocean, weather
  [
    'img',
    'gibs-opera-dswx',
    gibs(
      `OPERA_L3_Dynamic_Surface_Water_Extent-HLS/default/${weekAgo}/GoogleMapsCompatible_Level12/3/3/5.png`,
    ),
    'integrated',
  ],
  [
    'img',
    'gibs-viirs-flood',
    gibs(`VIIRS_Combined_Flood_1-Day/default/${d}/GoogleMapsCompatible_Level9/3/3/5.png`),
    'integrated',
  ],
  [
    'img',
    'gibs-imerg',
    gibs(`IMERG_Precipitation_Rate/default/${d}/GoogleMapsCompatible_Level6/2/1/2.png`),
    'integrated',
  ],
  [
    'img',
    'gibs-ghrsst',
    gibs(
      `GHRSST_L4_MUR_Sea_Surface_Temperature/default/${weekAgo}/GoogleMapsCompatible_Level7/2/1/2.png`,
    ),
    'integrated',
  ],
  [
    'fetch',
    'gebco-wms-capabilities',
    'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
    'integrated',
  ],
  [
    'img',
    'gebco-wms-getmap',
    'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=GEBCO_LATEST_2&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=512&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true',
    'integrated',
  ],
  [
    'fetch',
    'gebco-wms-featureinfo',
    'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=GEBCO_LATEST_2&QUERY_LAYERS=GEBCO_LATEST_2&STYLES=&SRS=EPSG:4326&BBOX=142.1,11.3,142.3,11.5&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text/plain&FORMAT=image/png',
    'not usable (no values returned)',
  ],
  [
    'fetch',
    'noaa-dem-global-mosaic-identify',
    'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/identify?geometry=%7B%22x%22%3A142.2%2C%22y%22%3A11.35%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=true&f=json',
    'integrated',
  ],
  [
    'fetch',
    'opentopodata-gebco',
    'https://api.opentopodata.org/v1/gebco2020?locations=11.35,142.2',
    'rejected (no CORS)',
  ],
  // Feeds and point services
  [
    'fetch',
    'usgs-earthquakes-day',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    'integrated',
  ],
  [
    'fetch',
    'eonet-events',
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5',
    'integrated',
  ],
  ['fetch', 'eonet-categories', 'https://eonet.gsfc.nasa.gov/api/v3/categories', 'integrated'],
  [
    'fetch',
    'open-meteo-elevation',
    'https://api.open-meteo.com/v1/elevation?latitude=27.9881&longitude=86.925',
    'integrated',
  ],
  [
    'fetch',
    'open-meteo-forecast',
    'https://api.open-meteo.com/v1/forecast?latitude=7.29&longitude=80.63&current=temperature_2m,wind_speed_10m,relative_humidity_2m',
    'integrated',
  ],
  [
    'fetch',
    'usgs-epqs',
    'https://epqs.nationalmap.gov/v1/json?x=-105.2705&y=40.015&wkid=4326&units=Meters&includeDate=true',
    'integrated',
  ],
  [
    'fetch',
    'nominatim',
    'https://nominatim.openstreetmap.org/search?q=Kandy&format=jsonv2&limit=1',
    'integrated',
  ],
  ['fetch', 'photon', 'https://photon.komoot.io/api/?q=Kandy&limit=1', 'not used'],
  [
    'fetch',
    'opensky-anonymous',
    'https://opensky-network.org/api/states/all?lamin=45.8&lomin=5.9&lamax=47.8&lomax=10.5',
    'future (CORS restricted)',
  ],
  ['fetch', 'rainviewer', 'https://api.rainviewer.com/public/weather-maps.json', 'not used'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
const headers = {};
page.on('response', async (r) => {
  try {
    headers[r.url()] = {
      status: r.status(),
      acao: r.headers()['access-control-allow-origin'] ?? null,
      cache: r.headers()['cache-control'] ?? null,
      ctype: r.headers()['content-type'] ?? null,
      ratelimit: Object.fromEntries(
        Object.entries(r.headers()).filter(([k]) => k.includes('rate') || k.includes('limit')),
      ),
    };
  } catch {
    // Response headers unavailable (e.g. aborted request).
  }
});
await page.route('http://continuum-probe.test/**', (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
);
await page.goto('http://continuum-probe.test/');

const results = [];
for (const [kind, id, url, status] of probes) {
  const t0 = Date.now();
  const res = await page.evaluate(
    async ({ kind, url }) => {
      try {
        if (kind === 'img') {
          return await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 20000);
            img.onload = () => {
              clearTimeout(timer);
              try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, c.width, c.height).data;
                let opaqueBlack = 0;
                for (let k = 0; k < data.length; k += 4) {
                  if (data[k + 3] === 255 && data[k] + data[k + 1] + data[k + 2] === 0)
                    opaqueBlack++;
                }
                resolve({
                  ok: true,
                  w: img.naturalWidth,
                  h: img.naturalHeight,
                  opaqueBlackPct: Math.round((opaqueBlack / (data.length / 4)) * 1000) / 10,
                });
              } catch (e) {
                resolve({ ok: false, error: 'canvas tainted: ' + e.message });
              }
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve({ ok: false, error: 'img error (CORS or HTTP)' });
            };
            img.src = url;
          });
        }
        if (kind === 'openfreemap-tile') {
          const tileJson = await (await fetch(url)).json();
          const tileUrl = tileJson.tiles[0]
            .replace('{z}', '14')
            .replace('{x}', '4823')
            .replace('{y}', '6160');
          const r = await fetch(tileUrl);
          const buf = await r.arrayBuffer();
          return { ok: r.ok, status: r.status, bytes: buf.byteLength, sample: tileUrl };
        }
        const init = kind === 'range' ? { headers: { Range: 'bytes=0-1023' } } : {};
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 25000);
        const r = await fetch(url, { ...init, signal: ac.signal });
        clearTimeout(timer);
        const buf = await r.arrayBuffer();
        const text = new TextDecoder().decode(buf.slice(0, 300));
        return {
          ok: r.ok,
          status: r.status,
          bytes: buf.byteLength,
          contentRange: r.headers.get('content-range'),
          imagerySources: r.headers.get('x-amz-meta-x-imagery-sources'),
          sample:
            kind === 'range' || r.headers.get('content-type')?.startsWith('image/') ? null : text,
        };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    { kind, url },
  );
  results.push({ id, status, kind, url, ms: Date.now() - t0, ...res, http: headers[url] ?? null });
  console.log(
    (res.ok ? 'OK  ' : 'FAIL').padEnd(5),
    id.padEnd(34),
    String(res.status ?? '').padEnd(4),
    (headers[url]?.acao ?? '').padEnd(28),
    res.opaqueBlackPct !== undefined ? `opaque-black ${res.opaqueBlackPct}%` : '',
    res.error ?? '',
    `[${status}]`,
  );
}
writeFileSync(
  process.argv[2] ?? 'probe-results.json',
  JSON.stringify(
    { probedAt: new Date().toISOString(), origin: 'http://continuum-probe.test', results },
    null,
    2,
  ),
);
await browser.close();
