import { useEngine } from '../../app/EngineContext';
import { spaceStore, useSpace } from '../../core/state/hooks';
import { CLOCK_SPEEDS } from '../../spatial/space/clock';
import { BODIES, body, mapTitle } from '../../spatial/space/bodies';
import { Section, Toggle } from '../common/ui';

const SPEED_LABELS: Record<number, string> = {
  1: 'Real time',
  60: '1 min/s',
  3_600: '1 h/s',
  86_400: '1 day/s',
  604_800: '1 week/s',
  2_592_000: '30 days/s',
};

const AU = 149_597_870_700;
const LIGHT = 299_792_458;

/** Distances: kilometres near Earth, astronomical units (with km) beyond. */
export function formatDistance(metres: number): string {
  if (metres < 0.01 * AU) return `${Math.round(metres / 1000).toLocaleString('en')} km`;
  const millions = metres / 1e9;
  return `${(metres / AU).toFixed(2)} au (${
    millions >= 1000
      ? `${(millions / 1000).toFixed(2)} billion`
      : `${Math.round(millions).toLocaleString('en')} million`
  } km)`;
}

function formatLightTime(metres: number): string {
  const seconds = metres / LIGHT;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${Math.round(seconds % 60)} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The time on the clock, to the minute, in UTC. */
export function formatClock(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : '';
}

/** Bodies to fly to, the clock, and what the focused body is. */
export function SolarSystemSection() {
  const engine = useEngine();
  const s = useSpace((v) => v);
  const focused = s.focus ? body(s.focus) : null;
  return (
    <Section title="Solar system" aside={s.focus ? 'In space' : 'At Earth'}>
      <div className="chips" role="group" aria-label="Fly to">
        {BODIES.map((b) => (
          <button
            key={b.id}
            className={`chip${s.focus === b.id ? ' is-on' : ''}`}
            aria-pressed={s.focus === b.id}
            disabled={!engine}
            onClick={() => engine?.flyToBody(b.id)}
          >
            <i style={{ background: b.colour }} aria-hidden="true" />
            {b.name}
          </button>
        ))}
      </div>
      {s.focus && (
        <div className="button-row">
          <button
            className="button button--secondary button--small"
            onClick={() => engine?.returnToEarth()}
          >
            Back to Earth
          </button>
          <small className="hint">
            Drag to orbit, scroll to zoom; [ and ] step through bodies.
          </small>
        </div>
      )}
      {focused && (
        <dl className="rows">
          {s.fromEarth !== null && (
            <>
              <dt>From Earth</dt>
              <dd>
                {formatDistance(s.fromEarth)}; light takes {formatLightTime(s.fromEarth)}
              </dd>
            </>
          )}
          {s.distance !== null && (
            <>
              <dt>Camera to surface</dt>
              <dd>{formatDistance(Math.max(0, s.distance - Math.max(...focused.radii)))}</dd>
            </>
          )}
          <dt>Radius</dt>
          <dd>{Math.round(focused.radii[0] / 1000).toLocaleString('en')} km (IAU 2015)</dd>
          <dt>Surface</dt>
          <dd>{mapTitle(focused.id) ?? focused.noMap ?? 'Cesium globe with the layers above'}</dd>
        </dl>
      )}
      <div className="button-row">
        <button
          className="button button--secondary button--small"
          disabled={!engine || s.live}
          onClick={() => engine?.clockToNow()}
        >
          Now
        </button>
        <button
          className="button button--secondary button--small"
          disabled={!engine}
          aria-pressed={s.paused}
          onClick={() => engine?.toggleClockPaused()}
        >
          {s.paused ? 'Play' : 'Pause'}
        </button>
        <small className="hint mono" aria-live="off">
          {formatClock(s.time)}
          {s.live ? ' · now' : ''}
        </small>
      </div>
      <div className="chips" role="group" aria-label="How fast time runs">
        {CLOCK_SPEEDS.map((speed) => (
          <button
            key={speed}
            className={`chip${s.speed === speed ? ' is-on' : ''}`}
            aria-pressed={s.speed === speed}
            disabled={!engine}
            onClick={() => engine?.setClockSpeed(speed)}
          >
            {SPEED_LABELS[speed]}
          </button>
        ))}
      </div>
      <Toggle
        checked={s.orbits}
        onChange={(orbits) => spaceStore.set({ orbits })}
        label="Orbits"
        hint="Each body’s path over one orbit, from the same positions (shown in space)."
      />
      <Toggle checked={s.labels} onChange={(labels) => spaceStore.set({ labels })} label="Names" />
    </Section>
  );
}
