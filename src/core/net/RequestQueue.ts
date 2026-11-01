// Bounded-concurrency request queue with priorities, de-duplication and cancellation.
//
// Every tile-like fetch in Continuum goes through one of these, so the number of requests
// a provider receives at once is capped regardless of how fast the camera moves, and work
// that is no longer wanted can be dropped before (or while) it runs.

export type QueueJob<T> = (signal: AbortSignal) => Promise<T>;

interface Entry<T> {
  key: string;
  run: QueueJob<T>;
  priority: number;
  controller: AbortController;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  promise: Promise<T>;
  started: boolean;
  /** Arbitrary data the owner can use to decide whether the job is still wanted. */
  tag: unknown;
}

export class AbortedError extends Error {
  constructor(message = 'Request aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface QueueStats {
  active: number;
  queued: number;
  completed: number;
  failed: number;
  aborted: number;
}

export class RequestQueue {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly pending: Entry<unknown>[] = [];
  private activeCount = 0;
  readonly stats: QueueStats = { active: 0, queued: 0, completed: 0, failed: 0, aborted: 0 };
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly name: string,
    private maxConcurrent: number,
  ) {}

  setMaxConcurrent(value: number): void {
    this.maxConcurrent = Math.max(1, value);
    this.pump();
  }

  get size(): number {
    return this.entries.size;
  }

  get busy(): boolean {
    return this.activeCount >= this.maxConcurrent;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Enqueue a job. A job with the same key that is already queued or running is shared
   * rather than duplicated; its priority is raised if the new request is more urgent.
   */
  enqueue<T>(key: string, run: QueueJob<T>, priority = 0, tag?: unknown): Promise<T> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing) {
      if (priority > existing.priority) existing.priority = priority;
      if (tag !== undefined) existing.tag = tag;
      return existing.promise;
    }
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const entry: Entry<T> = {
      key,
      run,
      priority,
      controller: new AbortController(),
      resolve,
      reject,
      promise,
      started: false,
      tag,
    };
    this.entries.set(key, entry as Entry<unknown>);
    this.pending.push(entry as Entry<unknown>);
    this.pump();
    return promise;
  }

  /** Abort one job, queued or running. */
  abort(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    const index = this.pending.indexOf(entry);
    if (index >= 0) this.pending.splice(index, 1);
    entry.controller.abort();
    entry.reject(new AbortedError());
    this.stats.aborted++;
    this.emit();
  }

  /** Abort every job for which the predicate returns true. Returns the number aborted. */
  abortWhere(shouldAbort: (tag: unknown, started: boolean, priority: number) => boolean): number {
    let count = 0;
    for (const entry of [...this.entries.values()]) {
      if (shouldAbort(entry.tag, entry.started, entry.priority)) {
        this.abort(entry.key);
        count++;
      }
    }
    return count;
  }

  abortAll(): void {
    for (const key of [...this.entries.keys()]) this.abort(key);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.stats.active = this.activeCount;
    this.stats.queued = this.pending.length;
    for (const listener of this.listeners) listener();
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrent && this.pending.length > 0) {
      // Highest priority first; among equals, the most recently requested (the camera's
      // current view) wins over older requests.
      let best = 0;
      for (let i = 1; i < this.pending.length; i++) {
        if (this.pending[i]!.priority >= this.pending[best]!.priority) best = i;
      }
      const entry = this.pending.splice(best, 1)[0]!;
      this.start(entry);
    }
    this.emit();
  }

  private start(entry: Entry<unknown>): void {
    entry.started = true;
    this.activeCount++;
    entry
      .run(entry.controller.signal)
      .then(
        (value) => {
          if (this.entries.get(entry.key) === entry) {
            this.entries.delete(entry.key);
            this.stats.completed++;
            entry.resolve(value);
          }
        },
        (error: unknown) => {
          if (this.entries.get(entry.key) === entry) {
            this.entries.delete(entry.key);
            if (isAbortError(error)) this.stats.aborted++;
            else this.stats.failed++;
            entry.reject(error);
          }
        },
      )
      .finally(() => {
        this.activeCount--;
        this.pump();
      });
  }
}
