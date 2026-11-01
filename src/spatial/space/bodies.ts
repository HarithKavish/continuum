// The bodies of the solar system Continuum shows: their sizes (IAU 2015 radii, NAIF
// pck00011), where their positions and orientation come from, and how they are drawn.

import { PLANETARY_MAPS, type MappedBody } from '../../providers/planetary/usgsPlanetaryMaps';
import type { OrbitingId } from './ephemeris';
import type { RotatingId } from './orientation';

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

export interface BodyDefinition {
  id: BodyId;
  name: string;
  /** Equatorial, equatorial, polar radii in metres. */
  radii: [number, number, number];
  /** Where the position comes from: the JPL elements, or Cesium (the Sun, the Moon, Earth). */
  orbit: OrbitingId | 'cesium';
  /** IAU 2015 rotation model, or Cesium's (Earth: IAU 2006; the Moon: the IAU Moon model). */
  rotation: RotatingId | 'cesium';
  /** USGS map, or null where none exists that is real data. */
  map: MappedBody | null;
  /** Colour drawn without a map, and while one loads. A display choice, not a measurement. */
  colour: string;
  /** Orbit line colour. */
  orbitColour: string;
  /** Why there is no map, for the reader. */
  noMap?: string;
}

const km = (a: number, b: number, c: number): [number, number, number] => [
  a * 1000,
  b * 1000,
  c * 1000,
];

export const BODIES: BodyDefinition[] = [
  {
    id: 'sun',
    name: 'Sun',
    radii: km(695700, 695700, 695700),
    orbit: 'cesium',
    rotation: 'sun',
    map: null,
    colour: '#fff4d6',
    orbitColour: '#ffffff',
    noMap: 'Drawn as a glowing disc with limb darkening; no surface features are shown.',
  },
  {
    id: 'mercury',
    name: 'Mercury',
    radii: km(2440.53, 2440.53, 2438.26),
    orbit: 'mercury',
    rotation: 'mercury',
    map: 'mercury',
    colour: '#9a9590',
    orbitColour: '#b8b1a8',
  },
  {
    id: 'venus',
    name: 'Venus',
    radii: km(6051.8, 6051.8, 6051.8),
    orbit: 'venus',
    rotation: 'venus',
    map: 'venus',
    colour: '#d8c08c',
    orbitColour: '#e6c98a',
  },
  {
    id: 'earth',
    name: 'Earth',
    radii: km(6378.1366, 6378.1366, 6356.7519),
    orbit: 'cesium',
    rotation: 'cesium',
    map: null,
    colour: '#4a7fc1',
    orbitColour: '#6fa8ff',
  },
  {
    id: 'moon',
    name: 'Moon',
    radii: km(1737.4, 1737.4, 1737.4),
    orbit: 'cesium',
    rotation: 'cesium',
    map: 'moon',
    colour: '#a8a8a8',
    orbitColour: '#c9c9c9',
  },
  {
    id: 'mars',
    name: 'Mars',
    radii: km(3396.19, 3396.19, 3376.2),
    orbit: 'mars',
    rotation: 'mars',
    map: 'mars',
    colour: '#b5653b',
    orbitColour: '#ff8a5c',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    radii: km(71492, 71492, 66854),
    orbit: 'jupiter',
    rotation: 'jupiter',
    map: 'jupiter',
    colour: '#c9a77c',
    orbitColour: '#e0b98a',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    radii: km(60268, 60268, 54364),
    orbit: 'saturn',
    rotation: 'saturn',
    map: null,
    colour: '#d9c48f',
    orbitColour: '#e8d49a',
    noMap:
      'No public-domain global map was found (the one USGS serves, by Björn Jónsson, has no stated terms): plain colour. The rings follow NASA’s ring fact sheet.',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    radii: km(25559, 25559, 24973),
    orbit: 'uranus',
    rotation: 'uranus',
    map: null,
    colour: '#a9d6dc',
    orbitColour: '#9fe3ec',
    noMap: 'No global map exists from spacecraft data (the USGS one is painted): plain colour.',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    radii: km(24764, 24764, 24341),
    orbit: 'neptune',
    rotation: 'neptune',
    map: null,
    colour: '#8fb5d8',
    orbitColour: '#7fb2ff',
    noMap: 'No global map exists from spacecraft data (the USGS one is painted): plain colour.',
  },
  {
    id: 'pluto',
    name: 'Pluto',
    radii: km(1188.3, 1188.3, 1188.3),
    orbit: 'pluto',
    rotation: 'pluto',
    map: 'pluto',
    colour: '#c8b49a',
    orbitColour: '#c7a98a',
  },
];

export function body(id: BodyId): BodyDefinition {
  return BODIES.find((b) => b.id === id)!;
}

export function mapTitle(id: BodyId): string | null {
  const map = body(id).map;
  return map ? PLANETARY_MAPS[map].title : null;
}

/**
 * Saturn's main rings from NASA's Saturnian Rings Fact Sheet (radii in km; optical depth and
 * albedo as the middle of each published range). Ring colour is a display choice.
 */
export const SATURN_RINGS = [
  { name: 'C', inner: 74_658, outer: 91_975, opticalDepth: 0.2, albedo: 0.21 },
  { name: 'B', inner: 91_975, outer: 117_507, opticalDepth: 1.45, albedo: 0.5 },
  { name: 'Cassini Division', inner: 117_507, outer: 122_340, opticalDepth: 0.05, albedo: 0.3 },
  { name: 'A', inner: 122_340, outer: 136_780, opticalDepth: 0.7, albedo: 0.5 },
  { name: 'F', inner: 139_826, outer: 140_326, opticalDepth: 0.1, albedo: 0.6 },
] as const;
