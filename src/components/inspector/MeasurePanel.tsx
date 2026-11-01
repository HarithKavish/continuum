import { useMemo } from 'react';
import { useEngine } from '../../app/EngineContext';
import { cancelProfile, computeProfile } from '../../core/inspection';
import { selectionStore, useSelection } from '../../core/state/hooks';
import {
  formatArea,
  formatDistance,
  polygonArea,
  polylineLengthMeters,
} from '../../spatial/measurements/geodesic';
import { mercatorPixelSpacingMeters } from '../../spatial/terrain/terrarium';
import { Row } from '../common/ui';
import { ProfileChart } from './ProfileChart';

const INSTRUCTIONS = {
  distance: 'Click (or press A / Space at the crosshair) to add points along a path.',
  area: 'Add at least three points around the area. The polygon closes back to the first point.',
  profile: 'Add two or more points; the elevation profile follows the path.',
} as const;

export function MeasurePanel({ tool }: { tool: 'distance' | 'area' | 'profile' }) {
  const engine = useEngine();
  const { points, profile } = useSelection((s) => ({
    points: s.measurePoints,
    profile: s.profile,
  }));
  const length = useMemo(() => polylineLengthMeters(points), [points]);
  const area = useMemo(() => (points.length >= 3 ? polygonArea(points) : null), [points]);

  const undo = () => {
    const next = points.slice(0, -1);
    selectionStore.set({ measurePoints: next });
    if (tool === 'profile' && engine) {
      if (next.length >= 2) void computeProfile(engine.terrainSource, next);
      else {
        cancelProfile();
        selectionStore.set({ profile: null });
      }
    }
  };
  const clear = () => {
    cancelProfile();
    selectionStore.set({ measurePoints: [], profile: null });
  };

  return (
    <div className="inspector" data-testid="measure-panel">
      <p className="hint">{INSTRUCTIONS[tool]}</p>
      <dl className="rows">
        <Row label="Points">{points.length}</Row>
        {tool !== 'area' && (
          <Row label="Path length (geodesic)">
            {points.length >= 2 ? <strong>{formatDistance(length)}</strong> : '—'}
          </Row>
        )}
        {tool === 'area' && (
          <>
            <Row label="Area (ellipsoidal)">
              {area ? <strong>{formatArea(area.areaSquareMeters)}</strong> : '—'}
            </Row>
            <Row label="Perimeter">{area ? formatDistance(area.perimeterMeters) : '—'}</Row>
          </>
        )}
      </dl>
      <p className="hint">
        Distances and areas are computed on the WGS84 ellipsoid (GeographicLib), along geodesics,
        ignoring terrain relief.
      </p>
      <div className="button-row">
        <button className="button button--secondary" onClick={undo} disabled={!points.length}>
          Undo point
        </button>
        <button className="button button--secondary" onClick={clear} disabled={!points.length}>
          Clear
        </button>
      </div>
      {tool === 'profile' && profile && (
        <div className="profile">
          {profile.status === 'loading' && <p className="hint">Sampling terrain along the path…</p>}
          {profile.status === 'error' && <p className="hint">Profile failed: {profile.error}</p>}
          {profile.status === 'ready' && (
            <>
              <ProfileChart samples={profile.samples} />
              <p className="hint">
                {profile.samples.length} samples from Terrain Tiles zoom {profile.zoom} (grid ≈{' '}
                {Math.round(mercatorPixelSpacingMeters(profile.samples[0]?.lat ?? 0, profile.zoom))}{' '}
                m). Heights are orthometric (≈ above sea level); features narrower than the grid are
                smoothed away.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
