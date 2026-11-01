import { useEngine } from '../../app/EngineContext';
import { cancelInspection } from '../../core/inspection';
import { selectionStore, uiStore, useSelection, useUi } from '../../core/state/hooks';
import { MeasurePanel } from '../inspector/MeasurePanel';
import { PointDetails } from '../inspector/PointDetails';
import { RecordDetails } from '../inspector/RecordDetails';

const TITLES = {
  inspect: 'Inspector',
  distance: 'Distance',
  area: 'Area',
  profile: 'Elevation profile',
} as const;

export function InspectorPanel() {
  const engine = useEngine();
  const open = useUi((s) => s.rightOpen);
  const { tool, inspection } = useSelection((s) => ({ tool: s.tool, inspection: s.inspection }));
  return (
    <aside
      className={`panel-shell panel-shell--right${open ? '' : ' is-collapsed'}`}
      aria-label="Information"
    >
      <button
        className="panel-toggle"
        aria-expanded={open}
        aria-controls="info-panel"
        onClick={() => uiStore.set((s) => ({ rightOpen: !s.rightOpen }))}
      >
        {open ? 'Hide info' : 'Info'}
      </button>
      <div id="info-panel" className="panel-body" hidden={!open}>
        <div className="panel-heading">
          <h2>{TITLES[tool]}</h2>
          {tool === 'inspect' && inspection && (
            <button
              className="button button--secondary button--small"
              onClick={() => {
                cancelInspection();
                selectionStore.set({ inspection: null });
              }}
            >
              Clear
            </button>
          )}
        </div>
        {tool !== 'inspect' ? (
          <MeasurePanel tool={tool} />
        ) : inspection?.kind === 'point' ? (
          <PointDetails inspection={inspection} />
        ) : inspection?.kind === 'record' ? (
          <RecordDetails record={inspection.record} />
        ) : (
          <div className="empty">
            <p>
              Select any point on the globe to see its coordinates, elevation from every available
              source, and current weather.
            </p>
            <p>Select an earthquake or event marker for its details and source record.</p>
            <button
              className="button button--secondary"
              disabled={!engine}
              onClick={() => engine?.action('select')}
            >
              Inspect the centre of the view
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
