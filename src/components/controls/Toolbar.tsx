import type { ReactNode } from 'react';
import { cancelInspection, cancelProfile } from '../../core/inspection';
import type { Tool } from '../../core/state/appState';
import { selectionStore, useSelection } from '../../core/state/hooks';

// Icons stand in for the labels on narrow screens; the label stays as the accessible name.
const TOOLS: { id: Tool; label: string; title: string; icon: ReactNode }[] = [
  {
    id: 'inspect',
    label: 'Inspect',
    title: 'Inspect a point or select an event',
    icon: (
      <>
        <circle cx="8" cy="8" r="4.5" />
        <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
      </>
    ),
  },
  {
    id: 'distance',
    label: 'Distance',
    title: 'Measure a geodesic path',
    icon: (
      <>
        <circle cx="3.5" cy="12.5" r="1.6" />
        <circle cx="12.5" cy="3.5" r="1.6" />
        <path d="M4.8 11.2 11.2 4.8" strokeDasharray="2 1.6" />
      </>
    ),
  },
  {
    id: 'area',
    label: 'Area',
    title: 'Measure an area on the ellipsoid',
    icon: <path d="M3 4.5 13 3l-1 9.5-7.5 1Z" fill="currentColor" fillOpacity="0.25" />,
  },
  {
    id: 'profile',
    label: 'Profile',
    title: 'Elevation profile along a path',
    icon: <path d="M1 13 5 7l3 3 3-6 4 9" />,
  },
];

/** The tool picker, shown at the start of the status bar. */
export function Toolbar() {
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
          <svg
            className="toolbar__icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          >
            {t.icon}
          </svg>
          <span className="toolbar__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
