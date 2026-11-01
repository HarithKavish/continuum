// Gamepad connection tracking and per-frame polling (navigator.getGamepads()).
//
// Polling happens from the render loop, not on a timer, so input is sampled exactly once
// per frame. A disconnect mid-frame simply yields no snapshot; nothing throws.

import { savePreferences, loadPreferences } from '../core/state/preferences';
import { createStore } from '../core/state/store';
import {
  type Binding,
  type ButtonAction,
  type ControllerProfile,
  isPressed,
  type PadSnapshot,
  reviveProfile,
} from './GamepadMapping';

export interface PadInfo {
  index: number;
  id: string;
  mapping: string;
}

export const gamepadStore = createStore({
  supported: typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function',
  pads: [] as PadInfo[],
  activeIndex: null as number | null,
  paused: false,
  profile: reviveProfile(loadPreferences().controls),
  /** Raw readings of the active pad, published for the calibration screen (~10 Hz). */
  live: null as { axes: number[]; buttons: number[] } | null,
});

export class GamepadManager {
  private previous = new Map<ButtonAction, boolean>();
  private lastLivePublish = 0;
  private bindingCapture: {
    resolve: (b: Binding) => void;
    baseline: PadSnapshot;
    kind: 'any' | 'axis' | 'button';
  } | null = null;

  constructor() {
    if (!gamepadStore.get().supported) return;
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    this.refreshPads();
  }

  dispose(): void {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
  }

  private onConnect = () => this.refreshPads();
  private onDisconnect = () => {
    this.previous.clear();
    this.refreshPads();
  };

  private refreshPads(): void {
    const pads = this.rawPads().map((p) => ({ index: p.index, id: p.id, mapping: p.mapping }));
    const { activeIndex } = gamepadStore.get();
    const stillThere = pads.some((p) => p.index === activeIndex);
    gamepadStore.set({ pads, activeIndex: stillThere ? activeIndex : (pads[0]?.index ?? null) });
  }

  private rawPads(): Gamepad[] {
    try {
      return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
    } catch {
      // Some embedded contexts block the API by permissions policy.
      return [];
    }
  }

  setActive(index: number): void {
    gamepadStore.set({ activeIndex: index });
  }

  setPaused(paused: boolean): void {
    gamepadStore.set({ paused });
  }

  updateProfile(update: (p: ControllerProfile) => ControllerProfile): void {
    const profile = update(structuredClone(gamepadStore.get().profile));
    gamepadStore.set({ profile });
    savePreferences({ controls: profile });
  }

  /** Read the active pad. Returns null when none is connected. */
  poll(now: number): PadSnapshot | null {
    const { activeIndex } = gamepadStore.get();
    if (activeIndex === null) return null;
    const pad = this.rawPads().find((p) => p.index === activeIndex);
    if (!pad) {
      this.refreshPads();
      return null;
    }
    const snapshot: PadSnapshot = {
      axes: Array.from(pad.axes),
      buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    };
    if (now - this.lastLivePublish > 100) {
      this.lastLivePublish = now;
      gamepadStore.set({
        live: {
          axes: [...snapshot.axes],
          buttons: snapshot.buttons.map((b) => b.value || (b.pressed ? 1 : 0)),
        },
      });
    }
    if (this.bindingCapture) this.checkCapture(snapshot);
    return snapshot;
  }

  /** Buttons that went from released to pressed since the previous poll. */
  pressedEdges(snapshot: PadSnapshot, profile: ControllerProfile): Set<ButtonAction> {
    const edges = new Set<ButtonAction>();
    for (const [action, binding] of Object.entries(profile.buttons) as [ButtonAction, Binding][]) {
      const down = isPressed(snapshot, binding, profile.rest);
      if (down && !this.previous.get(action)) edges.add(action);
      this.previous.set(action, down);
    }
    return edges;
  }

  isHeld(snapshot: PadSnapshot, action: ButtonAction, profile: ControllerProfile): boolean {
    return isPressed(snapshot, profile.buttons[action], profile.rest);
  }

  /** Record the current axis readings as each axis's rest position (sticks and triggers released). */
  calibrateRest(): boolean {
    const { activeIndex } = gamepadStore.get();
    const pad = this.rawPads().find((p) => p.index === activeIndex);
    if (!pad) return false;
    const rest = Array.from(pad.axes, (a) =>
      Math.abs(a) < 0.35 ? a : a < -0.9 ? -1 : a > 0.9 ? 1 : a,
    );
    this.updateProfile((p) => ({ ...p, rest }));
    return true;
  }

  /** Resolve with the next input the user moves or presses, for rebinding. */
  captureBinding(kind: 'any' | 'axis' | 'button'): Promise<Binding> {
    return new Promise((resolve) => {
      const { activeIndex } = gamepadStore.get();
      const pad = this.rawPads().find((p) => p.index === activeIndex);
      const baseline: PadSnapshot = pad
        ? {
            axes: Array.from(pad.axes),
            buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
          }
        : { axes: [], buttons: [] };
      this.bindingCapture = { resolve, baseline, kind };
    });
  }

  cancelCapture(): void {
    this.bindingCapture = null;
  }

  private checkCapture(s: PadSnapshot): void {
    const capture = this.bindingCapture!;
    if (capture.kind !== 'axis') {
      const i = s.buttons.findIndex(
        (b, k) => (b.pressed || b.value > 0.6) && !capture.baseline.buttons[k]?.pressed,
      );
      if (i >= 0) {
        this.bindingCapture = null;
        capture.resolve({ type: 'button', index: i });
        return;
      }
    }
    if (capture.kind !== 'button') {
      for (let i = 0; i < s.axes.length; i++) {
        const delta = s.axes[i]! - (capture.baseline.axes[i] ?? 0);
        if (Math.abs(delta) > 0.6) {
          const base = capture.baseline.axes[i] ?? 0;
          const kind = base < -0.9 || base > 0.9 ? 'trigger' : 'stick';
          this.bindingCapture = null;
          // The user pushes in the "positive" direction for the action being bound.
          capture.resolve({ type: 'axis', index: i, invert: kind === 'stick' && delta < 0, kind });
          return;
        }
      }
    }
  }
}
