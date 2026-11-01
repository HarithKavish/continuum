// A minimal external store. Rendering state that changes every frame (the camera) lives in
// its own store and is published at a throttled rate, so React only re-renders the few
// components that read it, and only when the selected slice actually changes.

import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      let changed = false;
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(state[key], patch[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    !a ||
    !b ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Subscribe a component to a slice of a store; re-renders only when the slice changes (shallowly). */
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  const cache = useRef<{ state: T; slice: S } | null>(null);
  const getSlice = useCallback(() => {
    const state = store.get();
    if (cache.current && cache.current.state === state) return cache.current.slice;
    const next = selector(state);
    if (cache.current && shallowEqual(cache.current.slice, next)) {
      cache.current = { state, slice: cache.current.slice };
      return cache.current.slice;
    }
    cache.current = { state, slice: next };
    return next;
  }, [store, selector]);
  return useSyncExternalStore(store.subscribe, getSlice, getSlice);
}
