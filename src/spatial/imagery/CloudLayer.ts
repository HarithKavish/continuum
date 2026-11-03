// The live cloud layer. By default it shows the latest hour the satellites have published,
// and when the next hour arrives it keeps the old frame until the new one has drawn, so the
// clouds never blink off. On request it replays the last hours: one imagery layer per frame,
// crossfading from each to the next so the clouds move as the satellites saw them. Only
// real frames are shown; the crossfade blends two neighbouring frames and invents no
// motion between them.

import { ImageryLayer, type Credit, type ImageryLayerCollection } from 'cesium';
import { CloudFrameProvider } from './CloudFrameProvider';
import { altitudeFade, frameWeights } from './cloudImagery';
import { cancelFrame } from './cloudSources';

/** Share of a frame's requested tiles that must be drawn before it is shown. */
const READY_SHARE = 0.8;
/** Alpha updates per second while replaying; each one costs a render. */
const UPDATES_PER_SECOND = 15;

interface Frame {
  time: string;
  layer: ImageryLayer;
  provider: CloudFrameProvider;
  /** Replaced (a new hour, or shadows switched): shown only until a wanted frame is ready. */
  retiring: boolean;
}

export class CloudLayer {
  private frames: Frame[] = [];
  private seconds = 0;
  private sinceUpdate = Infinity;
  private shown = false;
  /** Frame time currently dominating the view, for the interface. */
  shownTime: string | null = null;

  constructor(
    private readonly collection: ImageryLayerCollection,
    private readonly credit: Credit,
    private readonly wrap: (provider: CloudFrameProvider) => void,
  ) {}

  get layers(): ImageryLayer[] {
    return this.frames.map((f) => f.layer);
  }

  /**
   * Show these frame times (oldest first), with or without shadows. Frames already loaded
   * are kept; frames no longer wanted stay until a wanted one is ready.
   */
  setTimes(times: string[], shadows: boolean): void {
    const reusable = new Map(
      this.frames
        .filter((f) => !f.retiring && f.provider.shadows === shadows)
        .map((f) => [f.time, f]),
    );
    const wanted = times.map((time, i) => {
      const existing = reusable.get(time);
      if (existing) return existing;
      // The newest frame is requested first, so clouds appear before older frames load.
      const provider = new CloudFrameProvider(time, this.credit, i, shadows);
      this.wrap(provider);
      const layer = new ImageryLayer(provider as never, { alpha: 0, show: this.shown });
      this.collection.add(layer);
      return { time, layer, provider, retiring: false };
    });
    const retiring = this.frames.filter((f) => !wanted.includes(f));
    for (const f of retiring) f.retiring = true;
    this.frames = [...retiring, ...wanted];
  }

  private ready(f: Frame): boolean {
    const { completed, pending } = f.provider;
    return completed > 0 && completed >= READY_SHARE * (completed + pending);
  }

  /** Remove frames, cancelling their queued fetches unless a remaining frame shares them. */
  private drop(frames: Frame[]): void {
    for (const f of frames) {
      this.collection.remove(f.layer, true);
      this.frames.splice(this.frames.indexOf(f), 1);
    }
    for (const f of frames) if (!this.frames.some((g) => g.time === f.time)) cancelFrame(f.time);
  }

  /**
   * Show the right frame (or, when replaying, advance the loop) and set each frame's
   * opacity. Returns true when anything visible changed, so the caller can request a render.
   */
  update(dtSeconds: number, replay: boolean, opacity: number, cameraHeight: number): boolean {
    const visible = opacity * altitudeFade(cameraHeight);
    const show = visible > 0;
    let changed = false;
    if (show !== this.shown) {
      this.shown = show;
      changed = true;
      for (const f of this.frames) {
        f.layer.show = show; // hidden frames stop requesting tiles
        if (!show) cancelFrame(f.time); // and drop the fetches still queued for them
      }
    }
    const wanted = this.frames.filter((f) => !f.retiring);
    const readyWanted = wanted.filter((f) => this.ready(f));
    const retiring = this.frames.filter((f) => f.retiring);
    if (retiring.length && readyWanted.length) {
      this.drop(retiring);
      changed = true;
    }
    if (replay) this.seconds += dtSeconds;
    this.sinceUpdate += dtSeconds;
    if (!changed && this.sinceUpdate < 1 / UPDATES_PER_SECOND) return false;
    this.sinceUpdate = 0;

    const weights = new Map<Frame, number>();
    if (replay && readyWanted.length >= 2) {
      frameWeights(readyWanted.length, this.seconds).forEach((w, k) =>
        weights.set(readyWanted[k]!, w),
      );
    } else {
      // The newest wanted frame that has drawn, else the frame it replaces, else the newest
      // (a new hour starts empty).
      const hold =
        readyWanted.at(-1) ?? this.frames.filter((f) => this.ready(f)).at(-1) ?? wanted.at(-1);
      if (hold) weights.set(hold, 1);
    }
    let dominant: Frame | undefined;
    for (const f of this.frames) {
      const w = weights.get(f) ?? 0;
      const alpha = visible * w;
      if (Math.abs(f.layer.alpha - alpha) > 1e-3) {
        f.layer.alpha = alpha;
        changed = true;
      }
      if (!dominant || w > (weights.get(dominant) ?? 0)) dominant = f;
    }
    this.shownTime = dominant?.time ?? null;
    return changed;
  }

  destroy(): void {
    this.drop([...this.frames]);
  }
}
