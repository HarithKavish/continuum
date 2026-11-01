import type { RefObject } from 'react';
import { useEngine } from '../../app/EngineContext';
import { uiStore, useCamera, useGamepad, useStatus } from '../../core/state/hooks';
import { formatAltitude, formatLatLon } from '../../spatial/coordinates/coordinates';
import { Toolbar } from '../controls/Toolbar';

/**
 * The single bar along the bottom: tools, where the camera and pointer are, whether data
 * is still arriving, camera shortcuts, and the provider credits (which Cesium writes into
 * `creditsRef`). Readouts that only matter sometimes — controller, speed — appear only then.
 */
export function StatusBar({ creditsRef }: { creditsRef: RefObject<HTMLDivElement | null> }) {
  const engine = useEngine();
  const camera = useCamera((s) => ({
    height: s.height,
    hag: s.heightAboveGround,
    heading: s.heading,
    pointer: s.pointer,
  }));
  const status = useStatus((s) => ({
    engine: s.engine,
    terrain: s.terrain,
    tilesLoaded: s.tilesLoaded,
    navSpeed: s.navSpeed,
    imageryErrors: s.imageryErrors,
  }));
  const pad = useGamepad((s) => ({ pads: s.pads, activeIndex: s.activeIndex, paused: s.paused }));
  const loading = status.terrain.inFlight + status.terrain.queued > 0 || !status.tilesLoaded;
  const errors = status.terrain.failed + status.imageryErrors;
  const activePad = pad.pads.find((p) => p.index === pad.activeIndex);
  const heading = Math.round((camera.heading + 360) % 360);

  return (
    <footer className="statusbar" aria-label="Status">
      <Toolbar />
      <span
        className="statusbar__item"
        title={
          camera.hag !== null
            ? `Camera height above the WGS84 ellipsoid; ${formatAltitude(camera.hag)} above the terrain`
            : 'Camera height above the WGS84 ellipsoid'
        }
      >
        {status.engine === 'ready' ? formatAltitude(camera.height) : 'Starting…'}
      </span>
      {camera.pointer && (
        <span
          className="statusbar__item statusbar__item--pointer mono"
          title="Position under the pointer (WGS84)"
        >
          {formatLatLon(camera.pointer, 4)}
        </span>
      )}
      <span
        className="statusbar__item"
        aria-live="polite"
        title={loading ? 'Loading tiles' : 'Up to date'}
      >
        <span className={`status-dot ${loading ? '' : 'status-dot--online'}`} aria-hidden="true" />
        {loading && <span className="statusbar__hint">Loading</span>}
        {errors > 0 && <small>{errors} tile errors</small>}
      </span>
      <span className="statusbar__group">
        <button
          className="statusbar__icon"
          disabled={!engine}
          onClick={() => engine?.recenter()}
          aria-label={`Heading ${heading}°. North up, looking straight down (H / Y)`}
          title={`Heading ${heading}° — north up (H / Y)`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" style={{ rotate: `${-heading}deg` }}>
            <path d="M8 1.5 11.5 13 8 10.5 4.5 13Z" fill="currentColor" />
          </svg>
        </button>
        <button
          className="statusbar__icon"
          disabled={!engine}
          onClick={() => engine?.flyTo(12, 78, { height: 20_000_000 })}
          aria-label="Whole-Earth view"
          title="Whole-Earth view"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <ellipse cx="8" cy="8" rx="2.6" ry="6" fill="none" stroke="currentColor" />
            <path d="M2 8h12" stroke="currentColor" />
          </svg>
        </button>
      </span>
      {activePad && (
        <button
          className="statusbar__item statusbar__button"
          onClick={() => uiStore.set({ dialog: 'controls' })}
          aria-label={`Controller ${pad.paused ? 'paused' : 'connected'}: ${activePad.id}`}
          title={activePad.id}
        >
          {pad.paused ? 'Controller paused' : 'Controller'}
        </button>
      )}
      {status.navSpeed !== 1 && (
        <span className="statusbar__item" title="Navigation speed (LB / RB)">
          Speed ×{status.navSpeed}
        </span>
      )}
      <div
        ref={creditsRef}
        className="credits"
        aria-label="Data attribution"
        title="Data attribution. Every source and licence is under Sources."
      />
      {/* Narrow screens: the credits line has no room, so attribution is one tap away. */}
      <button
        className="statusbar__icon statusbar__attribution"
        onClick={() => uiStore.set({ dialog: 'sources' })}
        aria-label="Data attribution and sources"
        title="Data attribution and sources"
      >
        ©
      </button>
    </footer>
  );
}
