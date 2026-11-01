import { PROVIDERS } from '../../config/providers/catalog';
import { FUTURE_SOURCES } from '../../config/providers/future';
import { useEngine } from '../../app/EngineContext';
import { useFeeds, useLayers } from '../../core/state/hooks';
import { Dialog, ExternalLink, Row, Status, Unavailable } from '../common/ui';

export function SourcesDialog() {
  const engine = useEngine();
  const layers = useLayers((s) => s);
  const feeds = useFeeds((s) => s);
  const active = new Set<string>(engine?.imagery.activeProviderIds() ?? []);
  if (layers.terrainEnabled) active.add('aws-terrain-tiles');
  if (feeds.earthquakes.enabled) active.add('usgs-earthquakes');
  if (feeds.events.enabled) active.add('nasa-eonet');
  if (feeds.buildings.enabled && feeds.buildings.count > 0) active.add('openfreemap-buildings');

  return (
    <Dialog title="Sources and attribution" wide>
      <p>
        Every request goes directly from this browser to the provider below. Continuum has no
        server, stores nothing it fetches, and needs no account or key. Values a provider does not
        document are marked as not stated.
      </p>
      <div className="source-catalogue">
        {PROVIDERS.map((p) => (
          <article key={p.id} className="source-entry" id={`source-${p.id}`}>
            <header>
              <h3>{p.name}</h3>
              {active.has(p.id) ? (
                <Status tone="live">In view</Status>
              ) : (
                <Status tone="neutral">Available</Status>
              )}
            </header>
            <p className="hint">{p.description}</p>
            <dl className="rows rows--compact">
              <Row label="Provider">{p.organisation}</Row>
              <Row label="Dataset">{p.dataset}</Row>
              <Row label="Coverage">{p.coverage.description}</Row>
              <Row label="Resolution">{p.resolution}</Row>
              <Row label="Vertical accuracy">
                {p.accuracy.vertical ?? <Unavailable>Not stated</Unavailable>}
              </Row>
              <Row label="Horizontal accuracy">
                {p.accuracy.horizontal ?? <Unavailable>Not stated</Unavailable>}
              </Row>
              {p.verticalDatum && <Row label="Vertical datum">{p.verticalDatum}</Row>}
              {p.surfaceModel && <Row label="Surface model">{p.surfaceModel}</Row>}
              <Row label="Updates">{p.temporal.description}</Row>
              <Row label="Licence">
                <ExternalLink href={p.licence.url}>{p.licence.name}</ExternalLink>
                {p.licence.notes && <small> {p.licence.notes}</small>}
              </Row>
              <Row label="Attribution">{p.attribution.full}</Row>
              <Row label="Access">
                {p.endpoint.protocol.toUpperCase()} · {p.endpoint.format} · no authentication · CORS
                verified {p.cors.verifiedOn}
              </Row>
              <Row label="Rate limits">{p.rateLimits}</Row>
              <Row label="Caching">{p.caching}</Row>
            </dl>
            {p.limitations.length > 0 && (
              <ul className="limitations">
                {p.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <p>
              <ExternalLink href={p.documentationUrl}>Documentation</ExternalLink> ·{' '}
              <ExternalLink href={p.homepageUrl}>Provider</ExternalLink>
            </p>
          </article>
        ))}
      </div>
      <h3>Not integrated yet</h3>
      <p className="hint">
        Sources investigated and set aside because they need a login, a key, a proxy, or do not
        permit browser access.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Why not now</th>
          </tr>
        </thead>
        <tbody>
          {FUTURE_SOURCES.map((f) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td>{f.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        3D rendering by{' '}
        <ExternalLink href="https://cesium.com/platform/cesiumjs/">CesiumJS</ExternalLink> (Apache
        2.0). Geodesics by GeographicLib (MIT). Geoid by egm96-universal (MIT) using NGA EGM96.
      </p>
    </Dialog>
  );
}
