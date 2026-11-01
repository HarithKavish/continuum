import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAYS,
  IMAGERY_LAYERS,
  OVERLAYS_BEFORE_KNOWN,
  REPLACED_OVERLAYS,
} from '../../src/config/providers/layers';
import { restoreOverlays, type Preferences } from '../../src/core/state/preferences';

const ids = IMAGERY_LAYERS.filter((l) => l.role === 'overlay').map((l) => l.providerId);
const restore = (prefs: Preferences) =>
  restoreOverlays(prefs, {
    ids,
    defaults: DEFAULT_OVERLAYS,
    replaced: REPLACED_OVERLAYS,
    legacyKnown: OVERLAYS_BEFORE_KNOWN,
  });
const added = [
  'openfreemap-roads',
  'overture-buildings',
  'geostationary-clouds',
  'ign-orthophotos',
];

describe('restoring saved overlay choices', () => {
  it('starts a first visit at the defaults', () => {
    expect([...restore({})].sort()).toEqual([...DEFAULT_OVERLAYS].sort());
  });

  it('switches on overlays added since choices saved by an earlier release', () => {
    // What every release before #8 saved on startup, whatever the reader then did.
    const on = restore({ overlays: ['openfreemap-boundaries', 'openfreemap-places'] });
    for (const id of added) expect(on.has(id)).toBe(true);
    expect(on.has('openfreemap-places')).toBe(true);
    // Overlays the reader had and left off stay off.
    expect(on.has('gibs-sst')).toBe(false);
  });

  it('keeps an earlier release’s choice to switch an overlay off', () => {
    const on = restore({ overlays: ['openfreemap-boundaries'] });
    expect(on.has('openfreemap-places')).toBe(false);
    expect(on.has('openfreemap-roads')).toBe(true);
  });

  it('carries a retired overlay over to the ones that replaced it', () => {
    const on = restore({ overlays: ['gibs-reference-labels'] });
    expect(on.has('openfreemap-boundaries')).toBe(true);
    expect(on.has('openfreemap-places')).toBe(true);
  });

  it('keeps a choice to switch off an overlay the reader had been offered', () => {
    const on = restore({ overlays: ['openfreemap-places'], knownOverlays: ids });
    expect([...on]).toEqual(['openfreemap-places']);
  });

  it('starts an overlay the saved choices never saw at its default', () => {
    const known = ids.filter((id) => id !== 'openfreemap-roads' && id !== 'gibs-sst');
    const on = restore({ overlays: [], knownOverlays: known });
    expect([...on]).toEqual(['openfreemap-roads']); // on by default; gibs-sst is off by default
  });

  it('ignores saved values of the wrong shape', () => {
    const on = restore({ overlays: 'roads' as unknown as string[] });
    expect([...on].sort()).toEqual([...DEFAULT_OVERLAYS].sort());
  });
});
