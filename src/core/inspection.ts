// Point inspection and elevation profiles: starting and cancelling them. The work itself
// (the elevation and weather providers, the geoid, the geodesic path) is in
// inspectionWork.ts and loads with the first inspection, so the interface does not carry it.

import type { TerrariumTileSource } from '../spatial/terrain/TerrariumTileSource';

let current: AbortController | undefined;
let currentProfile: AbortController | undefined;

export function cancelInspection(): void {
  current?.abort();
  current = undefined;
}

export function cancelProfile(): void {
  currentProfile?.abort();
  currentProfile = undefined;
}

/** Whether `controller` belongs to the profile still wanted (not superseded or cancelled). */
export function isCurrentProfile(controller: AbortController): boolean {
  return currentProfile === controller;
}

/** Inspect a point; any inspection in progress is cancelled. */
export function inspectPoint(source: TerrariumTileSource, lat: number, lon: number): void {
  current?.abort();
  const controller = (current = new AbortController());
  void import('./inspectionWork').then((work) => {
    if (!controller.signal.aborted) work.inspectPoint(source, lat, lon, controller);
  });
}

/** Elevation profile along a path; any profile in progress is cancelled. */
export async function computeProfile(
  source: TerrariumTileSource,
  points: { lon: number; lat: number }[],
): Promise<void> {
  currentProfile?.abort();
  const controller = (currentProfile = new AbortController());
  const work = await import('./inspectionWork');
  if (!controller.signal.aborted) await work.computeProfile(source, points, controller);
}
