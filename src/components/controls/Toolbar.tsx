import { useEngine } from '../../app/EngineContext';
import { cancelInspection, cancelProfile } from '../../core/inspection';
import type { Tool } from '../../core/state/appState';
import { selectionStore, useSelection } from '../../core/state/hooks';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'inspect', label: 'Inspect', title: 'Inspect a point or select an event' },
  { id: 'distance', label: 'Distance', title: 'Measure a geodesic path' },
  { id: 'area', label: 'Area', title: 'Measure an area on the ellipsoid' },
  { id: 'profile', label: 'Profile', title: 'Elevation profile along a path' },
];

export function Toolbar() {
  const engine = useEngine();
  const tool = useSelection((s) => s.tool);
  const choose = (id: Tool) => {
    cancelProfile();
    if (id !== 'inspect') cancelInspection();
    selectionStore.set({
      tool: id,
      measurePoints: [],
      profile: null,
      inspection: id === 'inspect' ? selectionStore.get().inspection : null,
    });
  };
  return (
    <nav className="toolbar" aria-label="Tools">
      <div className="toolbar__group" role="radiogroup" aria-label="Tool">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={tool === t.id}
            className={`toolbar__button${tool === t.id ? ' is-active' : ''}`}
            title={t.title}
            onClick={() => choose(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar__group" aria-label="Camera">
        <button
          className="toolbar__button"
          disabled={!engine}
          onClick={() => engine?.zoomBy(2)}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          className="toolbar__button"
          disabled={!engine}
          onClick={() => engine?.zoomBy(0.5)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          className="toolbar__button"
          disabled={!engine}
          onClick={() => engine?.recenter()}
          title="North up, looking straight down (H / Y)"
        >
          Recentre
        </button>
        <button
          className="toolbar__button"
          disabled={!engine}
          onClick={() => engine?.flyTo(12, 78, { height: 20_000_000 })}
          title="Return to the whole-Earth view"
        >
          Earth
        </button>
      </div>
    </nav>
  );
}
