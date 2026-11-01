import { describe, expect, it } from 'vitest';
import { addIntents, smoothToward } from '../../src/gamepad/CameraControls';
import {
  defaultProfile,
  readBinding,
  reviveProfile,
  shapeInput,
  shapeStick,
  shapeTrigger,
} from '../../src/gamepad/GamepadMapping';

const pad = (axes: number[], pressed: number[] = []) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    value: pressed.includes(i) ? 1 : 0,
  })),
});

describe('stick shaping', () => {
  it('outputs exactly zero inside the radial dead zone (no drift)', () => {
    expect(shapeStick(0.1, -0.1, 0.15, 1.7)).toEqual([0, 0]);
    expect(shapeStick(0.149, 0, 0.15, 1.7)).toEqual([0, 0]);
  });

  it('starts from zero at the dead-zone edge, with no jump', () => {
    const [x] = shapeStick(0.16, 0, 0.15, 1);
    expect(x).toBeCloseTo(0.01 / 0.85, 9);
  });

  it('reaches full output at full deflection and keeps direction', () => {
    const [x, y] = shapeStick(Math.SQRT1_2, -Math.SQRT1_2, 0.15, 1.7);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 9);
    expect(x).toBeCloseTo(-y, 9);
  });

  it('applies the response curve for fine control near centre', () => {
    const [linear] = shapeStick(0.5, 0, 0.15, 1);
    const [curved] = shapeStick(0.5, 0, 0.15, 2);
    expect(curved).toBeCloseTo(linear * linear, 9);
  });

  it('shapes triggers with their own dead zone', () => {
    expect(shapeTrigger(0.05, 0.06, 1)).toBe(0);
    expect(shapeTrigger(1, 0.06, 1.7)).toBe(1);
  });
});

describe('bindings', () => {
  it('maps the standard layout: stick up pans forward, RT zooms in, LT zooms out', () => {
    const profile = defaultProfile();
    expect(shapeInput(pad([0, -1, 0, 0]), profile).panY).toBeCloseTo(1, 9);
    expect(shapeInput(pad([0, 0, 0, 0], [7]), profile).zoom).toBeCloseTo(1, 9);
    expect(shapeInput(pad([0, 0, 0, 0], [6]), profile).zoom).toBeCloseTo(-1, 9);
    expect(shapeInput(pad([0, 0, 1, 0]), profile).rotate).toBeCloseTo(1, 9);
  });

  it('removes a calibrated rest offset from a worn stick', () => {
    const binding = { type: 'axis' as const, index: 0, invert: false, kind: 'stick' as const };
    expect(readBinding(pad([0.12]), binding, [0.12])).toBe(0);
    expect(readBinding(pad([1]), binding, [0.12])).toBeCloseTo(1, 9);
    expect(readBinding(pad([-1]), binding, [0.12])).toBeCloseTo(-1, 9);
  });

  it('reads a trigger reported as an axis resting at -1 (non-standard mappings)', () => {
    const binding = { type: 'axis' as const, index: 2, invert: false, kind: 'trigger' as const };
    expect(readBinding(pad([0, 0, -1]), binding, [0, 0, -1])).toBe(0);
    expect(readBinding(pad([0, 0, 1]), binding, [0, 0, -1])).toBe(1);
    expect(readBinding(pad([0, 0, 0]), binding, [0, 0, -1])).toBeCloseTo(0.5, 9);
  });

  it('falls back to defaults for malformed stored profiles', () => {
    const revived = reviveProfile({
      deadZone: 9,
      buttons: { select: { type: 'nonsense' } },
      sensitivity: { pan: 'x' },
    });
    expect(revived.deadZone).toBe(0.6);
    expect(revived.buttons.select).toEqual(defaultProfile().buttons.select);
    expect(revived.sensitivity.pan).toBe(1);
    expect(reviveProfile(null)).toEqual(defaultProfile());
  });
});

describe('frame-rate independence', () => {
  it('settles to the same value in the same time at 5 fps and 120 fps', () => {
    const run = (fps: number) => {
      // Exactly one second of frames at each rate.
      let v = 1;
      for (let i = 0; i < fps; i++) v = smoothToward(v, 0.5, 1 / fps, 0.12);
      return v;
    };
    expect(run(5)).toBeCloseTo(run(120), 6);
  });

  it('snaps to exactly zero once negligible, so idle input never drifts', () => {
    let v = 1;
    for (let i = 0; i < 200; i++) v = smoothToward(v, 0, 1 / 60, 0.12);
    expect(v).toBe(0);
  });

  it('combines input sources and clamps them', () => {
    const sum = addIntents(
      { panX: 1, panY: 0, rotate: 0, tilt: 0, zoom: 2 },
      { panX: 1.5, panY: 0.2, rotate: 0, tilt: 0, zoom: 1 },
    );
    expect(sum.panX).toBe(2);
    expect(sum.zoom).toBe(2);
    expect(sum.panY).toBeCloseTo(0.2, 9);
  });
});
