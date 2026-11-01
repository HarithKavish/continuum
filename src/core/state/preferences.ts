// Per-viewer preferences in this origin's localStorage. Only the reader's own choices are
// kept here — never provider data. Every access is guarded: storage can be unavailable
// (private windows, blocked site data), and the app must work without it.

const KEY = 'continuum.preferences.v1';

export interface Preferences {
  baseLayer?: string;
  overlays?: string[];
  /** Every overlay offered when `overlays` was saved; any added since start at their defaults. */
  knownOverlays?: string[];
  /** Realistic day and night (true) or full daylight. */
  lighting?: boolean;
  /** Orbit lines and body names in space. */
  space?: { orbits?: boolean; labels?: boolean };
  lowPower?: boolean;
  controls?: unknown;
}

export interface OverlayCatalogue {
  /** Every overlay offered now. */
  ids: readonly string[];
  defaults: readonly string[];
  /** Retired overlay → the overlays that replaced it. */
  replaced: Readonly<Record<string, readonly string[]>>;
  /** The overlays offered to choices saved before `knownOverlays` was recorded. */
  legacyKnown: readonly string[];
}

/**
 * The overlays to switch on. Saved choices decide only the overlays the reader had been
 * offered when they saved them; anything added since starts at its default, so a new layer
 * is not silently off for everyone who visited before it existed.
 */
export function restoreOverlays(prefs: Preferences, catalogue: OverlayCatalogue): Set<string> {
  const { ids, defaults, replaced, legacyKnown } = catalogue;
  if (!Array.isArray(prefs.overlays)) return new Set(defaults);
  const current = (list: readonly string[]) =>
    new Set(list.flatMap((id) => (Object.hasOwn(replaced, id) ? replaced[id]! : [id])));
  const saved = current(prefs.overlays);
  const known = current(Array.isArray(prefs.knownOverlays) ? prefs.knownOverlays : legacyKnown);
  return new Set(ids.filter((id) => (known.has(id) ? saved.has(id) : defaults.includes(id))));
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Preferences) : {};
  } catch {
    return {};
  }
}

export function savePreferences(patch: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPreferences(), ...patch }));
  } catch {
    // Storage unavailable; preferences simply do not persist.
  }
}
