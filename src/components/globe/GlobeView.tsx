// Mounts the Cesium engine. The engine module (and Cesium with it) is loaded lazily so the
// page shell renders immediately; WebGL is checked first so a missing GPU produces an
// explanation instead of a blank page.

import { useEffect, useRef, type RefObject } from 'react';
import { statusStore, useStatus } from '../../core/state/hooks';
import type { Engine } from '../../spatial/rendering/Engine';

export function GlobeView({
  onEngine,
  creditsRef,
}: {
  onEngine: (engine: Engine | null) => void;
  /** Where Cesium writes the provider credits (inside the status bar). */
  creditsRef: RefObject<HTMLDivElement | null>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const engineState = useStatus((s) => ({ engine: s.engine, error: s.engineError }));

  useEffect(() => {
    let engine: Engine | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { Engine } = await import('../../spatial/rendering/Engine');
        if (cancelled || !container.current || !creditsRef.current) return;
        if (!Engine.isWebGLAvailable()) {
          statusStore.set({ engine: 'webgl-unavailable' });
          return;
        }
        engine = new Engine(container.current, creditsRef.current);
        onEngine(engine);
      } catch (error) {
        console.error(error);
        statusStore.set({
          engine: 'error',
          engineError: error instanceof Error ? error.message : 'The 3D engine could not start.',
        });
      }
    })();
    return () => {
      cancelled = true;
      onEngine(null);
      engine?.destroy();
    };
  }, [onEngine, creditsRef]);

  return (
    <>
      <div
        ref={container}
        className="globe"
        data-testid="globe"
        aria-label="3D globe"
        role="application"
      />
      {engineState.engine === 'loading' && (
        <div className="globe-message" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading the 3D engine…
        </div>
      )}
      {engineState.engine === 'webgl-unavailable' && (
        <div className="globe-message globe-message--error" role="alert">
          <strong>WebGL is not available.</strong>
          <p>
            Continuum renders the Earth with WebGL. Enable hardware acceleration in your browser
            settings, or try another browser or device. The data catalogue under Sources remains
            available.
          </p>
        </div>
      )}
      {engineState.engine === 'error' && (
        <div className="globe-message globe-message--error" role="alert">
          <strong>The 3D engine could not start.</strong>
          <p>{engineState.error}</p>
        </div>
      )}
    </>
  );
}
