import { useEngine } from '../../app/EngineContext';
import { uiStore, useCamera, useGamepad, useLayers, useStatus } from '../../core/state/hooks';
import { formatAltitude, formatLatLon } from '../../spatial/coordinates/coordinates';

export function StatusBar() {
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
    fps: s.fps,
    memoryMB: s.memoryMB,
    navSpeed: s.navSpeed,
    imageryErrors: s.imageryErrors,
    hidden: s.hidden,
  }));
  const { terrainEnabled, overlays, baseLayer } = useLayers((s) => ({
    terrainEnabled: s.terrainEnabled,
    overlays: s.overlays,
    baseLayer: s.baseLayer,
  }));
  const pad = useGamepad((s) => ({
    pads: s.pads,
    activeIndex: s.activeIndex,
    paused: s.paused,
    supported: s.supported,
  }));
  const activeSources =
    1 + (terrainEnabled ? 1 : 0) + Object.values(overlays).filter((o) => o.enabled).length;
  const loading = status.terrain.inFlight + status.terrain.queued > 0 || !status.tilesLoaded;
  const activePad = pad.pads.find((p) => p.index === pad.activeIndex);

  return (
    <footer className="statusbar" aria-label="Status">
      <span
        className="statusbar__item"
        title="Camera height above the WGS84 ellipsoid, and above the terrain"
      >
        <span className="statusbar__label">Altitude</span>
        {status.engine === 'ready' ? formatAltitude(camera.height) : '—'}
        {camera.hag !== null && camera.hag < 200_000 && (
          <small> · {formatAltitude(camera.hag)} above ground</small>
        )}
      </span>
      <span
        className="statusbar__item statusbar__item--wide"
        title="Position under the pointer (WGS84)"
      >
        <span className="statusbar__label">Pointer</span>
        <span className="mono">{camera.pointer ? formatLatLon(camera.pointer, 4) : '—'}</span>
      </span>
      <span className="statusbar__item" title="Heading of the camera">
        <span className="statusbar__label">Heading</span>
        {Math.round((camera.heading + 360) % 360)}°
      </span>
      <span className="statusbar__item" aria-live="polite">
        <span className={`status-dot ${loading ? '' : 'status-dot--online'}`} aria-hidden="true" />
        {status.hidden ? 'Paused (tab hidden)' : loading ? 'Loading tiles' : 'Up to date'}
        {status.terrain.failed + status.imageryErrors > 0 && (
          <small> · {status.terrain.failed + status.imageryErrors} tile errors</small>
        )}
      </span>
      <button
        className="statusbar__item statusbar__button"
        onClick={() => uiStore.set({ dialog: 'sources' })}
        title="Show sources and attribution"
      >
        <span className="statusbar__label">Sources</span>
        {activeSources} active · {baseLayer.split('-')[0]?.toUpperCase()}
      </button>
      <span className="statusbar__item" title="Navigation speed multiplier (LB / RB)">
        <span className="statusbar__label">Speed</span>×{status.navSpeed}
      </span>
      <button
        className="statusbar__item statusbar__button"
        onClick={() => uiStore.set({ dialog: 'controls' })}
        title={activePad ? activePad.id : 'No controller connected'}
      >
        <span className="statusbar__label">Controller</span>
        {!pad.supported
          ? 'Unsupported'
          : activePad
            ? pad.paused
              ? 'Paused'
              : 'Connected'
            : 'None'}
      </button>
      <span
        className="statusbar__item"
        title="Rendered frames per second (0 when idle: rendering only happens on change)"
      >
        <span className="statusbar__label">FPS</span>
        {status.fps}
        {status.memoryMB !== null && <small> · {status.memoryMB} MB JS heap</small>}
      </span>
      {!engine && status.engine === 'loading' && <span className="statusbar__item">Starting…</span>}
    </footer>
  );
}
