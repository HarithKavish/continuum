// Global maps of the Moon and planets from the USGS Astrogeology planetary WMS
// (planetarymaps.usgs.gov, CORS *). One equirectangular image per body, planetocentric,
// east-positive longitude from −180° at the left edge: exactly how Cesium's ellipsoid
// geometry lays texture coordinates, so no remapping is needed. Images are decoded once and
// kept in memory only.

import { cachedLoad, LruCache } from '../../core/net/LruCache';
import { RequestQueue } from '../../core/net/RequestQueue';
import { ProviderError } from '../base/types';

export const PLANETARY_MAPS_PROVIDER = 'usgs-planetary-maps';

export interface PlanetaryMap {
  /** USGS mapfile under /maps/, and the WMS layer. */
  mapfile: string;
  layer: string;
  /** What the map is, as the reader sees it. */
  title: string;
}

/** The maps used, by body (checked 2026-11-01; abstracts quoted in docs/RESEARCH.md). */
export const PLANETARY_MAPS = {
  mercury: {
    mapfile: 'mercury/mercury',
    layer: 'MESSENGER',
    title: 'MESSENGER MDIS global mosaic, 2016 (NASA, JHU APL)',
  },
  venus: {
    mapfile: 'venus/venus',
    layer: 'MAGELLAN_color',
    title:
      'Magellan radar mosaic of the surface, colourised (NASA, USGS); clouds hide it in visible light',
  },
  moon: {
    mapfile: 'earth/moon',
    layer: 'LROC_WAC',
    title: 'Lunar Reconnaissance Orbiter WAC mosaic, 2013 (NASA, GSFC, ASU)',
  },
  mars: {
    mapfile: 'mars/mars',
    layer: 'MDIM21_color',
    title: 'Viking MDIM 2.1 mosaic, colourised (USGS, NASA Ames)',
  },
  jupiter: {
    mapfile: 'jupiter/jupiter',
    layer: 'CASSINI',
    title: 'Cassini global map, December 2000 (NASA, JPL, SSI; PIA07782)',
  },
  pluto: {
    mapfile: 'pluto/pluto',
    layer: 'NEWHORIZONS_PLUTO_MOSAIC',
    title: 'New Horizons global mosaic, 2017 (NASA, JHU APL, SwRI, LPI)',
  },
} as const satisfies Record<string, PlanetaryMap>;

export type MappedBody = keyof typeof PLANETARY_MAPS;

const queue = new RequestQueue('usgs-planetary', 2);
const cache = new LruCache<HTMLCanvasElement>(8);

export function planetaryMapUrl(body: MappedBody, width: number): string {
  const { mapfile, layer } = PLANETARY_MAPS[body];
  const params = new URLSearchParams({
    map: `/maps/${mapfile}_simp_cyl.map`,
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    srs: 'EPSG:4326',
    bbox: '-180,-90,180,90',
    width: String(width),
    height: String(width / 2),
    format: 'image/jpeg',
  });
  return `https://planetarymaps.usgs.gov/cgi-bin/mapserv?${params}`;
}

/**
 * The body's map, `width` pixels wide (half as tall), drawn into a canvas: Cesium uploads
 * canvases with the vertical flip its textures expect, which it does not do for bitmaps.
 */
export function fetchPlanetaryMap(body: MappedBody, width: number): Promise<HTMLCanvasElement> {
  return cachedLoad(cache, queue, `${body}/${width}`, async (signal) => {
    const response = await fetch(planetaryMapUrl(body, width), {
      signal,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok)
      throw new ProviderError(PLANETARY_MAPS_PROVIDER, `${body} map: HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.startsWith('image/'))
      throw new ProviderError(PLANETARY_MAPS_PROVIDER, `${body} map: not an image`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = Object.assign(document.createElement('canvas'), {
      width: bitmap.width,
      height: bitmap.height,
    });
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  });
}
