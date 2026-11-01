// Per-viewer preferences in this origin's localStorage. Only the reader's own choices are
// kept here — never provider data. Every access is guarded: storage can be unavailable
// (private windows, blocked site data), and the app must work without it.

const KEY = 'continuum.preferences.v1';

export interface Preferences {
  baseLayer?: string;
  overlays?: string[];
  lowPower?: boolean;
  controls?: unknown;
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
