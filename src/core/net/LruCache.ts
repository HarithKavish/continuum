// A least-recently-used cache for decoded tiles, held in memory only, and the cached,
// queued load that the tile sources share.

import type { RequestQueue } from './RequestQueue';

export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.map.size;
  }

  /** Whether `key` is cached; values may themselves be null (a tile with no data). */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /** The cached value, now the most recently used, or undefined if absent. */
  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value!);
  }
}

/**
 * The cached value for `key`, or a load through `queue` (shared with any identical load
 * already queued) whose result is then cached. A load that throws caches nothing.
 */
export function cachedLoad<V>(
  cache: LruCache<V>,
  queue: RequestQueue,
  key: string,
  load: (signal: AbortSignal) => Promise<V>,
): Promise<V> {
  if (cache.has(key)) return Promise.resolve(cache.get(key) as V);
  return queue.enqueue(key, async (signal) => {
    const value = await load(signal);
    cache.set(key, value);
    return value;
  });
}
