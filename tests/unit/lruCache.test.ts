import { describe, expect, it } from 'vitest';
import { cachedLoad, LruCache } from '../../src/core/net/LruCache';
import { RequestQueue } from '../../src/core/net/RequestQueue';

describe('LRU cache', () => {
  it('evicts the least recently used entry, counting reads as use', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a is now the most recently used
    cache.set('c', 3);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('keeps null as a real value, distinct from absent', () => {
    const cache = new LruCache<string | null>(2);
    cache.set('ocean', null);
    expect(cache.has('ocean')).toBe(true);
    expect(cache.get('ocean')).toBeNull();
    expect(cache.get('land')).toBeUndefined();
  });
});

describe('cached loads', () => {
  it('loads once, then serves the cache', async () => {
    const cache = new LruCache<string>(4);
    const queue = new RequestQueue('test', 2);
    let loads = 0;
    const load = async () => `tile ${++loads}`;
    expect(await cachedLoad(cache, queue, 'k', load)).toBe('tile 1');
    expect(await cachedLoad(cache, queue, 'k', load)).toBe('tile 1');
    expect(loads).toBe(1);
  });

  it('caches nothing when the load fails, so the next request tries again', async () => {
    const cache = new LruCache<string>(4);
    const queue = new RequestQueue('test', 2);
    await expect(
      cachedLoad(cache, queue, 'k', async () => {
        throw new Error('HTTP 504');
      }),
    ).rejects.toThrow('504');
    expect(cache.has('k')).toBe(false);
    expect(await cachedLoad(cache, queue, 'k', async () => 'tile')).toBe('tile');
  });
});
