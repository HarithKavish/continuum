// Mouse and touch while orbiting a body; Cesium's own camera controller is switched off in
// space. Drag to orbit; wheel or pinch to zoom. At Earth, scrolling out past the highest
// Earth view hands over to space navigation, so the solar system is one gesture away.

import type { SpaceCamera } from './SpaceCamera';

/** Distance factor per pixel of wheel movement. */
const WHEEL_RATE = 0.0015;

export class SpacePointer {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: number | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: SpaceCamera,
    /** Whether the Earth view is as high as it goes, so scrolling out should leave it. */
    private readonly atEarthLimit: () => boolean,
    private readonly onChange: () => void,
  ) {
    element.addEventListener('pointerdown', this.down);
    element.addEventListener('pointermove', this.move);
    element.addEventListener('pointerup', this.up);
    element.addEventListener('pointercancel', this.up);
    element.addEventListener('wheel', this.wheel, { passive: false });
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.down);
    this.element.removeEventListener('pointermove', this.move);
    this.element.removeEventListener('pointerup', this.up);
    this.element.removeEventListener('pointercancel', this.up);
    this.element.removeEventListener('wheel', this.wheel);
  }

  private down = (e: PointerEvent) => {
    if (!this.camera.active) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pinch = null;
  };

  private move = (e: PointerEvent) => {
    const last = this.pointers.get(e.pointerId);
    if (!last || !this.camera.active) return;
    const next = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 1) {
      this.camera.drag(next.x - last.x, next.y - last.y);
    } else if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, next);
      const [a, b] = [...this.pointers.values()];
      const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch && span > 0) this.camera.zoom(this.pinch / span);
      this.pinch = span;
    }
    this.pointers.set(e.pointerId, next);
    this.onChange();
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
  };

  private wheel = (e: WheelEvent) => {
    if (!this.camera.active) {
      if (e.deltaY > 0 && this.atEarthLimit()) this.camera.enterAroundEarth();
      return;
    }
    e.preventDefault();
    this.camera.zoom(Math.exp(e.deltaY * WHEEL_RATE));
    this.onChange();
  };
}
