// Controller bindings and the maths that turn raw axis readings into navigation input.
//
// Defaults follow the W3C "standard" gamepad layout (https://w3c.github.io/gamepad/#remapping),
// which Xbox, PlayStation and most modern pads report in Chromium and Firefox. Controllers
// that report a non-standard mapping start from the same indices and can be rebound.

export type AnalogAction = 'panX' | 'panY' | 'rotate' | 'tilt' | 'zoomIn' | 'zoomOut';
export type ButtonAction =
  | 'select'
  | 'back'
  | 'togglePanel'
  | 'recenter'
  | 'pause'
  | 'slower'
  | 'faster'
  | 'fineUp'
  | 'fineDown'
  | 'fineLeft'
  | 'fineRight'
  | 'modifier';

export type Binding =
  | { type: 'axis'; index: number; invert: boolean; kind: 'stick' | 'trigger' }
  | { type: 'button'; index: number };

export interface ControllerProfile {
  analog: Record<AnalogAction, Binding>;
  buttons: Record<ButtonAction, Binding>;
  deadZone: number;
  triggerDeadZone: number;
  /** Response curve exponent: 1 is linear; higher gives finer control near centre. */
  exponent: number;
  sensitivity: { pan: number; rotate: number; tilt: number; zoom: number };
  /** Axis readings at rest, per axis index, captured by calibration. */
  rest: number[];
}

export const ANALOG_LABELS: Record<AnalogAction, string> = {
  panX: 'Pan left / right',
  panY: 'Pan forward / back',
  rotate: 'Rotate around target',
  tilt: 'Tilt camera',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
};

export const BUTTON_LABELS: Record<ButtonAction, string> = {
  select: 'Select location',
  back: 'Back / exit inspection',
  togglePanel: 'Toggle information panel',
  recenter: 'Recentre (north up, look down)',
  pause: 'Pause / resume controller',
  slower: 'Reduce speed',
  faster: 'Increase speed',
  fineUp: 'Fine move forward',
  fineDown: 'Fine move back',
  fineLeft: 'Fine move left',
  fineRight: 'Fine move right',
  modifier: 'Layer modifier (hold + D-pad left/right: change imagery)',
};

/** Names of standard-mapping inputs, for display. */
export const STANDARD_BUTTON_NAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'D-pad up',
  'D-pad down',
  'D-pad left',
  'D-pad right',
  'Home',
];
export const STANDARD_AXIS_NAMES = [
  'Left stick X',
  'Left stick Y',
  'Right stick X',
  'Right stick Y',
];

export function describeBinding(b: Binding, standard: boolean): string {
  if (b.type === 'button')
    return standard ? (STANDARD_BUTTON_NAMES[b.index] ?? `Button ${b.index}`) : `Button ${b.index}`;
  const name = standard ? (STANDARD_AXIS_NAMES[b.index] ?? `Axis ${b.index}`) : `Axis ${b.index}`;
  return `${name}${b.invert ? ' (inverted)' : ''}`;
}

export function defaultProfile(): ControllerProfile {
  return {
    analog: {
      panX: { type: 'axis', index: 0, invert: false, kind: 'stick' },
      // Stick up reads negative; inverted so that pushing up moves forward.
      panY: { type: 'axis', index: 1, invert: true, kind: 'stick' },
      rotate: { type: 'axis', index: 2, invert: false, kind: 'stick' },
      // Pushing up tilts the view up towards the horizon.
      tilt: { type: 'axis', index: 3, invert: true, kind: 'stick' },
      zoomIn: { type: 'button', index: 7 },
      zoomOut: { type: 'button', index: 6 },
    },
    buttons: {
      select: { type: 'button', index: 0 },
      back: { type: 'button', index: 1 },
      togglePanel: { type: 'button', index: 2 },
      recenter: { type: 'button', index: 3 },
      slower: { type: 'button', index: 4 },
      faster: { type: 'button', index: 5 },
      modifier: { type: 'button', index: 8 },
      pause: { type: 'button', index: 9 },
      fineUp: { type: 'button', index: 12 },
      fineDown: { type: 'button', index: 13 },
      fineLeft: { type: 'button', index: 14 },
      fineRight: { type: 'button', index: 15 },
    },
    deadZone: 0.15,
    triggerDeadZone: 0.06,
    exponent: 1.7,
    sensitivity: { pan: 1, rotate: 1, tilt: 1, zoom: 1 },
    rest: [],
  };
}

/**
 * Radial dead zone with rescaling and a power response curve, for a two-axis stick.
 * Inside the dead zone the output is exactly zero (no drift); outside it the magnitude is
 * rescaled to start from zero, so there is no jump at the dead-zone edge.
 */
export function shapeStick(
  x: number,
  y: number,
  deadZone: number,
  exponent: number,
): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadZone) return [0, 0];
  const clamped = Math.min(1, magnitude);
  const scaled = (clamped - deadZone) / (1 - deadZone);
  const curved = scaled ** exponent;
  return [(x / magnitude) * curved, (y / magnitude) * curved];
}

/** Dead zone and curve for a single unsigned value in [0, 1] (a trigger). */
export function shapeTrigger(value: number, deadZone: number, exponent: number): number {
  const v = Math.max(0, Math.min(1, value));
  if (v <= deadZone) return 0;
  return ((v - deadZone) / (1 - deadZone)) ** exponent;
}

export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** Raw value of a binding: sticks in [-1, 1] centred on rest, triggers in [0, 1]. */
export function readBinding(pad: PadSnapshot, b: Binding, rest: readonly number[]): number {
  if (b.type === 'button') {
    const button = pad.buttons[b.index];
    return button ? Math.max(button.value, button.pressed ? 1 : 0) : 0;
  }
  const raw = pad.axes[b.index] ?? 0;
  const r = rest[b.index] ?? (b.kind === 'trigger' ? guessTriggerRest(raw) : 0);
  let value: number;
  if (b.kind === 'stick') {
    // Remove a calibrated centre offset, keeping the full range reachable.
    value = raw >= r ? (raw - r) / Math.max(1e-6, 1 - r) : (raw - r) / Math.max(1e-6, 1 + r);
  } else {
    // Trigger on an axis: map rest → 0 and the far end → 1 (handles rest at -1 or 0).
    const far = r < 0 ? 1 : r > 0 ? -1 : 1;
    value = (raw - r) / (far - r);
  }
  value = Math.max(-1, Math.min(1, value));
  return b.invert ? -value : value;
}

function guessTriggerRest(raw: number): number {
  // Uncalibrated trigger axes usually rest at -1 (Linux/Firefox) or 0.
  return raw < -0.5 ? -1 : 0;
}

export function isPressed(pad: PadSnapshot, b: Binding, rest: readonly number[]): boolean {
  return Math.abs(readBinding(pad, b, rest)) > 0.5;
}

export interface ShapedInput {
  panX: number;
  panY: number;
  rotate: number;
  tilt: number;
  /** Positive zooms in. */
  zoom: number;
}

export function shapeInput(pad: PadSnapshot, profile: ControllerProfile): ShapedInput {
  const read = (a: AnalogAction) => readBinding(pad, profile.analog[a], profile.rest);
  const [panX, panY] = shapeStick(read('panX'), read('panY'), profile.deadZone, profile.exponent);
  const [rotate, tilt] = shapeStick(
    read('rotate'),
    read('tilt'),
    profile.deadZone,
    profile.exponent,
  );
  const trigger = (a: AnalogAction) => {
    const b = profile.analog[a];
    const v = Math.abs(read(a));
    return b.type === 'axis' && b.kind === 'stick'
      ? shapeStick(v, 0, profile.deadZone, profile.exponent)[0]
      : shapeTrigger(v, profile.triggerDeadZone, profile.exponent);
  };
  return {
    panX: panX * profile.sensitivity.pan,
    panY: panY * profile.sensitivity.pan,
    rotate: rotate * profile.sensitivity.rotate,
    tilt: tilt * profile.sensitivity.tilt,
    zoom: (trigger('zoomIn') - trigger('zoomOut')) * profile.sensitivity.zoom,
  };
}

/** Validates a stored profile, falling back to defaults for anything malformed. */
export function reviveProfile(value: unknown): ControllerProfile {
  const base = defaultProfile();
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<ControllerProfile>;
  const isBinding = (b: unknown): b is Binding =>
    !!b &&
    typeof b === 'object' &&
    ((b as Binding).type === 'button' || (b as Binding).type === 'axis') &&
    Number.isInteger((b as Binding).index);
  const num = (x: unknown, lo: number, hi: number, d: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
  for (const k of Object.keys(base.analog) as AnalogAction[])
    if (isBinding(v.analog?.[k])) base.analog[k] = v.analog[k];
  for (const k of Object.keys(base.buttons) as ButtonAction[])
    if (isBinding(v.buttons?.[k])) base.buttons[k] = v.buttons[k];
  base.deadZone = num(v.deadZone, 0, 0.6, base.deadZone);
  base.triggerDeadZone = num(v.triggerDeadZone, 0, 0.6, base.triggerDeadZone);
  base.exponent = num(v.exponent, 1, 3, base.exponent);
  if (v.sensitivity) {
    for (const k of Object.keys(base.sensitivity) as (keyof ControllerProfile['sensitivity'])[]) {
      base.sensitivity[k] = num(v.sensitivity[k], 0.1, 4, 1);
    }
  }
  if (Array.isArray(v.rest)) base.rest = v.rest.map((r) => num(r, -1, 1, 0));
  return base;
}
