// The live cloud layer: one imagery layer per recent frame time, all loading at once, and
// a loop that crossfades from each frame to the next so the clouds move as the satellites
// saw them. Only real frames are shown; the crossfade blends two neighbouring frames and
// invents no motion between them. Under realistic lighting each frame also casts its
// shadows on the ground (CloudShadowProvider), on a layer beneath all the clouds.

import { ImageryLayer, type Credit, type ImageryLayerCollection } from 'cesium';
import { CloudFrameProvider } from './CloudFrameProvider';
import { CloudShadowProvider } from './CloudShadowProvider';
import { altitudeFade, frameWeights } from './cloudImagery';

/** Share of a frame's requested tiles that must be drawn before it joins the loop. */
const READY_SHARE = 0.8;
/** Alpha updates per second while playing; each one costs a render. */
const UPDATES_PER_SECOND = 15;

export class CloudLayer {
  private frames: {
    time: string;
    layer: ImageryLayer;
    provider: CloudFrameProvider;
    shadow: ImageryLayer;
  }[] = [];
  private seconds = 0;
  private sinceUpdate = Infinity;
  /** Frame time currently dominating the view, for the interface. */
  shownTime: string | null = null;

  constructor(
    private readonly collection: ImageryLayerCollection,
    private readonly credit: Credit,
    private readonly wrap: (provider: CloudFrameProvider) => void,
  ) {}

  /** Shadows first, then clouds: every shadow is drawn beneath every cloud. */
  get layers(): ImageryLayer[] {
    return [...this.frames.map((f) => f.shadow), ...this.frames.map((f) => f.layer)];
  }

  /** Match the frames to `times` (oldest first), keeping layers that are already loaded. */
  setTimes(times: string[]): void {
    const kept = new Map(this.frames.map((f) => [f.time, f]));
    this.frames = times.map((time, i) => {
      const existing = kept.get(time);
      kept.delete(time);
      if (existing) return existing;
      // The newest frame is requested first, so clouds appear before the loop is ready.
      const provider = new CloudFrameProvider(time, this.credit, i);
      this.wrap(provider);
      const layer = new ImageryLayer(provider as never, { alpha: 0 });
      const shadowProvider = new CloudShadowProvider(time, this.credit, i);
      this.wrap(shadowProvider as never);
      const shadow = new ImageryLayer(shadowProvider as never, { alpha: 0, show: false });
      this.collection.add(shadow);
      this.collection.add(layer);
      return { time, layer, provider, shadow };
    });
    for (const f of kept.values()) {
      this.collection.remove(f.layer, true);
      this.collection.remove(f.shadow, true);
    }
  }

  /**
   * Frames with most of the current view drawn. Only these join the loop: EUMETView renders
   * every request on demand, so on a first visit the older frames can trail the newest by a
   * minute or more, and looping over a half-drawn frame would blink clouds on and off.
   */
  private readyFrames(): number[] {
    const ready: number[] = [];
    this.frames.forEach((f, i) => {
      const { completed, pending } = f.provider;
      if (completed > 0 && completed >= READY_SHARE * (completed + pending)) ready.push(i);
    });
    return ready;
  }

  /**
   * Advance the loop and set each frame's opacity. Returns true when anything visible
   * changed, so the caller can request a render.
   */
  update(
    dtSeconds: number,
    playing: boolean,
    opacity: number,
    cameraHeight: number,
    shadows: boolean,
  ): boolean {
    const visible = opacity * altitudeFade(cameraHeight);
    const show = visible > 0;
    let changed = false;
    for (const f of this.frames) {
      if (f.layer.show !== show) {
        f.layer.show = show; // hidden frames stop loading tiles
        changed = true;
      }
      if (f.shadow.show !== (show && shadows)) {
        f.shadow.show = show && shadows;
        changed = true;
      }
    }
    if (playing) this.seconds += dtSeconds;
    this.sinceUpdate += dtSeconds;
    if (!changed && this.sinceUpdate < 1 / UPDATES_PER_SECOND) return false;
    this.sinceUpdate = 0;
    const ready = this.readyFrames();
    const weights = new Array<number>(this.frames.length).fill(0);
    if (playing && ready.length >= 2) {
      frameWeights(ready.length, this.seconds).forEach((w, k) => (weights[ready[k]!] = w));
    } else {
      // Hold the newest frame that has drawn something (a new hour starts empty).
      weights[ready.at(-1) ?? this.frames.length - 1] = 1;
    }
    let dominant = 0;
    this.frames.forEach((f, i) => {
      const alpha = visible * weights[i]!;
      if (Math.abs(f.layer.alpha - alpha) > 1e-3) {
        f.layer.alpha = alpha;
        f.shadow.alpha = alpha;
        changed = true;
      }
      if (weights[i]! > weights[dominant]!) dominant = i;
    });
    this.shownTime = this.frames[dominant]?.time ?? null;
    return changed;
  }

  destroy(): void {
    for (const f of this.frames) {
      this.collection.remove(f.layer, true);
      this.collection.remove(f.shadow, true);
    }
    this.frames = [];
  }
}
