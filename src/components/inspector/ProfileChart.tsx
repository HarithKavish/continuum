import { useState } from 'react';
import type { ProfileSample } from '../../core/state/appState';
import { formatDistance } from '../../spatial/measurements/geodesic';

const W = 320;
const H = 150;
const PAD = { left: 44, right: 8, top: 10, bottom: 22 };

/** Elevation profile as an SVG area chart, with a hover readout. */
export function ProfileChart({ samples }: { samples: ProfileSample[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const valid = samples.filter((s) => s.elevation !== null) as (ProfileSample & {
    elevation: number;
  })[];
  if (valid.length < 2) return <p className="hint">No elevation data along this path.</p>;
  const total = samples[samples.length - 1]!.distanceMeters;
  const min = Math.min(...valid.map((s) => s.elevation));
  const max = Math.max(...valid.map((s) => s.elevation));
  const span = Math.max(1, max - min);
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;
  const x = (d: number) => PAD.left + (d / total) * (W - PAD.left - PAD.right);
  const y = (e: number) => PAD.top + (1 - (e - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const line = valid
    .map((s, i) => `${i ? 'L' : 'M'}${x(s.distanceMeters).toFixed(1)},${y(s.elevation).toFixed(1)}`)
    .join('');
  const area = `${line}L${x(valid[valid.length - 1]!.distanceMeters)},${H - PAD.bottom}L${x(valid[0]!.distanceMeters)},${H - PAD.bottom}Z`;
  const seaLevel = lo < 0 && hi > 0 ? y(0) : null;
  const point = hover !== null ? valid[hover] : null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < valid.length; i++) {
    const d = valid[i]!.elevation - valid[i - 1]!.elevation;
    if (d > 0) gain += d;
    else loss -= d;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = ((e.clientX - rect.left) / rect.width) * W;
    const dist = ((d - PAD.left) / (W - PAD.left - PAD.right)) * total;
    let best = 0;
    for (let i = 1; i < valid.length; i++) {
      if (Math.abs(valid[i]!.distanceMeters - dist) < Math.abs(valid[best]!.distanceMeters - dist))
        best = i;
    }
    setHover(best);
  };

  return (
    <figure className="profile-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Elevation profile over ${formatDistance(total)}, from ${Math.round(min)} m to ${Math.round(max)} m`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <path d={area} className="profile-chart__area" />
        <path d={line} className="profile-chart__line" />
        {seaLevel !== null && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={seaLevel}
            y2={seaLevel}
            className="profile-chart__sea"
          />
        )}
        <text x={PAD.left - 4} y={y(max) + 4} textAnchor="end" className="profile-chart__tick">
          {Math.round(max)}
        </text>
        <text x={PAD.left - 4} y={y(min) + 4} textAnchor="end" className="profile-chart__tick">
          {Math.round(min)}
        </text>
        <text x={PAD.left} y={H - 6} className="profile-chart__tick">
          0
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="profile-chart__tick">
          {formatDistance(total)}
        </text>
        {point && (
          <g>
            <line
              x1={x(point.distanceMeters)}
              x2={x(point.distanceMeters)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="profile-chart__cursor"
            />
            <circle
              cx={x(point.distanceMeters)}
              cy={y(point.elevation)}
              r={3.5}
              className="profile-chart__dot"
            />
          </g>
        )}
      </svg>
      <figcaption>
        {point
          ? `${formatDistance(point.distanceMeters)} along: ${Math.round(point.elevation)} m`
          : `Min ${Math.round(min)} m · max ${Math.round(max)} m · climb ${Math.round(gain)} m · descent ${Math.round(loss)} m`}
      </figcaption>
    </figure>
  );
}
