import type { RefObject } from 'react';
import { useEngine } from '../../app/EngineContext';
import {
  layersStore,
  uiStore,
  useCamera,
  useGamepad,
  useLayers,
  useSpace,
  useStatus,
} from '../../core/state/hooks';
import { body } from '../../spatial/space/bodies';
import { formatClock, formatDistance } from './SolarSystemSection';
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
  const lighting = useLayers((s) => s.lighting);
  const space = useSpace((s) => ({
    focus: s.focus,
    distance: s.distance,
    live: s.live,
    time: s.time,
    speed: s.speed,
    paused: s.paused,
  }));
  const focused = space.focus ? body(space.focus) : null;
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
        {status.engine !== 'ready'
          ? 'Starting…'
          : focused && space.distance !== null
            ? `${focused.name} · ${formatDistance(Math.max(0, space.distance - Math.max(...focused.radii)))}`
            : formatAltitude(camera.height)}
      </span>
      {!space.live && space.time && (
        <button
          className="statusbar__item statusbar__button mono"
          onClick={() => engine?.clockToNow()}
          title="The clock is not showing now. Select to return to the present, in real time."
        >
          {formatClock(space.time)}
          {space.paused
            ? ' · paused'
            : space.speed !== 1
              ? ` · ×${space.speed.toLocaleString('en')}`
              : ''}
        </button>
      )}
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
          aria-pressed={lighting}
          onClick={() => layersStore.set({ lighting: !lighting })}
          aria-label="Realistic day and night (L)"
          title={
            lighting
              ? 'Day and night from the Sun’s position now. Select for full daylight (L)'
              : 'Full daylight. Select for realistic day and night (L)'
          }
        >
          {lighting ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="currentColor" />
              <path
                d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
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
