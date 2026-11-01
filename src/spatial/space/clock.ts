// The clock's range and rates. Kept apart from the engine so the interface can use them
// without loading CesiumJS.

/**
 * The clock's range: the JPL elements hold from 3000 BC to AD 3000, but Pluto's elements
 * and Cesium's IAU 2006 tables (to 2050) are best near the present.
 */
export const CLOCK_RANGE = { start: '1900-01-01T00:00:00Z', stop: '2100-01-01T00:00:00Z' };

/** Clock rates offered, in simulated seconds per real second. */
export const CLOCK_SPEEDS = [1, 60, 3_600, 86_400, 604_800, 2_592_000];
