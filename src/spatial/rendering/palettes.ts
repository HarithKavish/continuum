// Data-encoding colour scales. These encode measured quantities (depth, category), not
// interface chrome, and the shared design system has no data-visualisation palette, so
// they are defined here — a declared exception in GOVERNANCE.md. Interface colours come
// from the design system's tokens.

/** Hypocentre depth classes, shallow (warm) to deep (cool), after the USGS convention. */
export const DEPTH_CLASSES: { maxKm: number; color: string; label: string }[] = [
  { maxKm: 10, color: '#f05a3a', label: '0–10 km' },
  { maxKm: 30, color: '#f2a33a', label: '10–30 km' },
  { maxKm: 70, color: '#e8d94a', label: '30–70 km' },
  { maxKm: 150, color: '#5fc98f', label: '70–150 km' },
  { maxKm: 300, color: '#4aa8e8', label: '150–300 km' },
  { maxKm: Infinity, color: '#8d6be8', label: '> 300 km' },
];

export function depthColor(depthKm: number | null): string {
  if (depthKm === null) return '#c9d1d6';
  return (DEPTH_CLASSES.find((c) => depthKm <= c.maxKm) ?? DEPTH_CLASSES[DEPTH_CLASSES.length - 1]!)
    .color;
}

/** Marker size in pixels: grows with magnitude (energy is ~32× per unit, size is not). */
export function magnitudeSize(mag: number | null): number {
  if (mag === null) return 5;
  return Math.max(4, Math.min(30, 3 + 2.6 * Math.max(0, mag)));
}

export const EVENT_COLORS: Record<string, string> = {
  wildfires: '#ff7a3d',
  severeStorms: '#7fb3ff',
  volcanoes: '#ff4d6d',
  seaLakeIce: '#bfe9ff',
  floods: '#3d8bff',
  earthquakes: '#f2a33a',
  landslides: '#c08a5a',
  drought: '#d9b44a',
  dustHaze: '#d8c49a',
  snow: '#ffffff',
  tempExtremes: '#ff9ec7',
  waterColor: '#4fd1c5',
  manmade: '#b0b7bd',
};

export const MEASURE_COLOR = '#ffd166';
export const SELECTION_COLOR = '#ffffff';
