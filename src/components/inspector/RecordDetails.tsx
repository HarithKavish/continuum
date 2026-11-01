import { providerById } from '../../config/providers/catalog';
import type { ObservationRecord } from '../../providers/base/types';
import { formatLatLon } from '../../spatial/coordinates/coordinates';
import { ExternalLink, formatTime, relativeTime, Row, Unavailable } from '../common/ui';

const LABELS: Record<string, string> = {
  place: 'Place',
  status: 'Review status',
  network: 'Contributing network',
  tsunamiFlag: 'Tsunami flag',
  significance: 'Significance (USGS)',
  pagerAlert: 'PAGER alert',
  feltReports: '“Did You Feel It?” reports',
  stations: 'Stations used',
  azimuthalGapDeg: 'Azimuthal gap (°)',
  nearestStationDeg: 'Nearest station (°)',
  rmsTravelTimeResidualS: 'RMS residual (s)',
  depthKm: 'Depth (km)',
  category: 'Category',
  firstObserved: 'First observed',
  observations: 'Geometry observations',
  closed: 'Closed',
  sources: 'Source agencies',
  description: 'Description',
};

export function RecordDetails({ record }: { record: ObservationRecord }) {
  const meta = providerById(record.providerId);
  const isQuake = record.kind === 'earthquake';
  return (
    <div className="inspector" data-testid="record-inspection">
      <h3>{record.title}</h3>
      <dl className="rows">
        <Row label="Observed">
          {formatTime(record.time)} <small>({relativeTime(record.time)})</small>
        </Row>
        {record.updated && <Row label="Last updated">{formatTime(record.updated)}</Row>}
        {record.magnitude && (
          <Row label="Magnitude">
            <strong>
              {record.magnitude.value} {record.magnitude.unit}
            </strong>
          </Row>
        )}
        <Row label={isQuake ? 'Epicentre' : 'Position'} mono>
          {formatLatLon(record, isQuake ? 3 : 2)}
        </Row>
        {isQuake && (
          <Row label="Hypocentre depth">
            {record.elevationMeters === null ? (
              <Unavailable />
            ) : (
              `${(-record.elevationMeters / 1000).toFixed(1)} km`
            )}
          </Row>
        )}
        <Row label="Source record id" mono>
          {record.sourceRecordId}
        </Row>
      </dl>
      {isQuake && (
        <p className="hint">
          Depth reference depends on the reporting network (NEIC uses the WGS84 geoid). Location and
          depth errors are per-event and often kilometres; three decimals of latitude ≈ 110 m is
          display precision only. The dashed line shows the hypocentre below the epicentre.
        </p>
      )}
      {!isQuake && (
        <p className="hint">
          EONET indexes events reported by other agencies; it is not a warning service. Positions
          are the latest reported geometry
          {record.geometry ? ', with the track or area drawn on the globe' : ''}.
        </p>
      )}
      <h4>Properties</h4>
      <dl className="rows">
        {Object.entries(record.properties).map(([k, v]) => (
          <Row key={k} label={LABELS[k] ?? k}>
            {v === null || v === '' ? <Unavailable /> : String(v)}
          </Row>
        ))}
      </dl>
      <h4>Links</h4>
      <ul className="link-list">
        {record.links.map((l) => (
          <li key={l.url}>
            <ExternalLink href={l.url}>{l.label}</ExternalLink>
          </li>
        ))}
      </ul>
      <p className="hint">
        Source: {meta.organisation}. {meta.attribution.full}
      </p>
    </div>
  );
}
