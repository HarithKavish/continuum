// Keyboard navigation, producing the same analog intent as a stick at full deflection.
// Mouse navigation is Cesium's own ScreenSpaceCameraController and is left enabled.

import type { NavIntent } from './CameraControls';

const BINDINGS: Record<string, [keyof NavIntent, number]> = {
  KeyW: ['panY', 1],
  ArrowUp: ['panY', 1],
  KeyS: ['panY', -1],
  ArrowDown: ['panY', -1],
  KeyA: ['panX', -1],
  ArrowLeft: ['panX', -1],
  KeyD: ['panX', 1],
  ArrowRight: ['panX', 1],
  KeyQ: ['rotate', -1],
  KeyE: ['rotate', 1],
  KeyR: ['tilt', 1],
  KeyF: ['tilt', -1],
  KeyZ: ['zoom', 1],
  Equal: ['zoom', 1],
  NumpadAdd: ['zoom', 1],
  PageUp: ['zoom', 1],
  KeyX: ['zoom', -1],
  Minus: ['zoom', -1],
  NumpadSubtract: ['zoom', -1],
  PageDown: ['zoom', -1],
};

export const KEYBOARD_GUIDE: [string, string][] = [
  ['W A S D / arrows', 'Pan'],
  ['Q / E', 'Rotate around target'],
  ['R / F', 'Tilt towards horizon / down'],
  ['Z or + / X or −', 'Zoom in / out'],
  ['Shift', 'Hold for 3× speed'],
  ['Alt', 'Hold for fine (¼) speed'],
  ['Space or Enter', 'Inspect the point under the crosshair'],
  ['Esc', 'Back / clear selection'],
  ['H', 'Recentre: north up, look down'],
  ['I', 'Toggle information panel'],
  ['L', 'Realistic day and night / full daylight'],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export class KeyboardInput {
  private readonly held = new Set<string>();
  private fast = false;
  private fine = false;

  constructor(
    private readonly target: HTMLElement | Window,
    private readonly onAction: (
      action: 'select' | 'back' | 'recenter' | 'togglePanel' | 'toggleLighting',
    ) => void,
  ) {
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
    window.addEventListener('blur', this.clear);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.clear);
  }

  private clear = () => {
    this.held.clear();
    this.fast = false;
    this.fine = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey) return;
    this.fast = e.shiftKey;
    this.fine = e.altKey;
    if (BINDINGS[e.code]) {
      this.held.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') this.onAction('select');
    else if (e.code === 'Escape') this.onAction('back');
    else if (e.code === 'KeyH') this.onAction('recenter');
    else if (e.code === 'KeyI') this.onAction('togglePanel');
    else if (e.code === 'KeyL') this.onAction('toggleLighting');
    else return;
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.fast = e.shiftKey;
    this.fine = e.altKey;
    this.held.delete(e.code);
  };

  intent(): NavIntent {
    const out: NavIntent = { panX: 0, panY: 0, rotate: 0, tilt: 0, zoom: 0 };
    for (const code of this.held) {
      const [axis, sign] = BINDINGS[code]!;
      out[axis] = Math.max(-1, Math.min(1, out[axis] + sign));
    }
    const scale = this.fast ? 3 : this.fine ? 0.25 : 1;
    if (scale !== 1) for (const k of Object.keys(out) as (keyof NavIntent)[]) out[k] *= scale;
    return out;
  }
}

/** Shared state written by the on-screen joysticks (touch) and read once per frame. */
export const virtualSticks = {
  left: { x: 0, y: 0 },
  right: { x: 0, y: 0 },
  zoom: 0,
  intent(): NavIntent {
    return {
      panX: this.left.x,
      panY: this.left.y,
      rotate: this.right.x,
      tilt: this.right.y,
      zoom: this.zoom,
    };
  },
};
