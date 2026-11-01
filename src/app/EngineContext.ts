import { createContext, useContext } from 'react';
import type { Engine } from '../spatial/rendering/Engine';

export const EngineContext = createContext<Engine | null>(null);

/** The running engine, or null while it loads (or if WebGL is unavailable). */
export function useEngine(): Engine | null {
  return useContext(EngineContext);
}
