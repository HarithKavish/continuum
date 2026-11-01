// Application configuration. Static, committed, and free of secrets: Continuum has none.

export const appConfig = {
  name: 'Continuum',
  /** Initial camera: whole-Earth view over the Indian Ocean, high enough to see the limb. */
  initialView: { lon: 78, lat: 12, height: 20_000_000 },
  terrain: {
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    maxConcurrent: 6,
    maxCachedTiles: 160,
  },
  imagery: {
    /** Requests in flight per imagery host. Cesium's default (18) is more than a public service should see from one viewer. */
    maxRequestsPerServer: 8,
  },
  feeds: {
    earthquakeRefreshMs: 60_000,
    eventsRefreshMs: 10 * 60_000,
    eventsLookbackDays: 30,
  },
  buildings: {
    tileJsonUrl: 'https://tiles.openfreemap.org/planet',
    zoom: 14,
    /** Buildings load only when the camera is this close to the ground. */
    maxCameraHeight: 3_000,
    maxTiles: 9,
  },
  geocoding: {
    /** Kill switch, so the service can be turned off if the OSMF asks, without a code change elsewhere. */
    enabled: true,
    endpoint: 'https://nominatim.openstreetmap.org/search',
  },
  navigation: {
    deadZone: 0.15,
    triggerDeadZone: 0.06,
    responseExponent: 1.7,
    smoothingSeconds: 0.12,
    speedSteps: [0.25, 0.5, 1, 2, 4],
    defaultSpeedIndex: 2,
    minClearanceMeters: 15,
    maxCameraHeightMeters: 60_000_000,
  },
} as const;
