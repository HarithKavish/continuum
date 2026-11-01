import { providerById } from '../../config/providers/catalog';
import { terrainSourceFor } from '../../config/providers/terrainSources';
import type { PointInspection } from '../../core/state/appState';
import { formatLatLon, formatLatLonDms } from '../../spatial/coordinates/coordinates';
import { GEOID_MODEL } from '../../spatial/geoid/egm96';
import { CORRECTION } from '../../spatial/terrain/terrarium';
import { ExternalLink, formatTime, Row, Status, Unavailable } from '../common/ui';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Metres with precision matched to a value's magnitude, never finer than a decimetre. */
function metres(v: number, decimals = 0): string {
  return `${v.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} m`;
}

export function PointDetails({ inspection }: { inspection: PointInspection }) {
  const { lat, lon, terrain, elevations, weather } = inspection;
  return (
    <div className="inspector" data-testid="point-inspection">
      <h3>Location</h3>
      <dl className="rows">
        <Row label="Latitude, longitude" mono>
          {formatLatLon({ lat, lon }, 5)}
        </Row>
        <Row label="DMS" mono>
          {formatLatLonDms({ lat, lon })}
        </Row>
        <Row label="Reference system">WGS84 geographic (EPSG:4326)</Row>
        <Row label="Selected">{formatTime(inspection.requestedAt)}</Row>
      </dl>
      <p className="hint">
        Coordinates are the point you selected (where the view ray met the rendered terrain, or the
        coordinates you entered). Five decimals (~1 m) is display precision, not the accuracy of the
        underlying data.
      </p>

      <h3>Elevation — Terrain Tiles</h3>
      {terrain.status === 'loading' && <p className="hint">Sampling the deepest available tile…</p>}
      {terrain.status === 'unavailable' && <p className="hint">{terrain.reason}</p>}
      {terrain.status === 'ready' && (
        <>
          <dl className="rows">
            <Row label="Elevation (orthometric)">
              <strong>{metres(terrain.orthometric)}</strong> <small>≈ above mean sea level</small>
            </Row>
            <Row label="Ellipsoidal height">
              {terrain.geoidUndulation === null ? (
                <Unavailable>Geoid model failed to load</Unavailable>
              ) : (
                <>{metres(terrain.orthometric + terrain.geoidUndulation)} above WGS84</>
              )}
            </Row>
            <Row label="Geoid undulation N">
              {terrain.geoidUndulation === null ? (
                <Unavailable />
              ) : (
                <>
                  {metres(terrain.geoidUndulation, 1)} <small>({GEOID_MODEL.name})</small>
                </>
              )}
            </Row>
            {terrain.orthometric < 0 && (
              <Row label="Below sea level">
                {metres(-terrain.orthometric)}{' '}
                <small>seabed depth or a land depression — this source does not say which</small>
              </Row>
            )}
            <Row label="Tile grid spacing">
              {metres(terrain.gridSpacingMeters, 1)}{' '}
              <small>(zoom {terrain.zoom} — not the source resolution)</small>
            </Row>
            <Row label="Slope">
              {terrain.slopeDeg === null ? (
                <Unavailable>Not computed for a value taken from a coarser tile</Unavailable>
              ) : (
                <>
                  {terrain.slopeDeg.toFixed(1)}°
                  {terrain.aspectDeg !== null &&
                    ` facing ${COMPASS[Math.round(terrain.aspectDeg / 45) % 8]}`}{' '}
                  <small>(Horn method, 3×3 tile pixels)</small>
                </>
              )}
            </Row>
            <Row label="Retrieved">{formatTime(terrain.retrievedAt)}</Row>
            <Row label="Tile last modified">{terrain.lastModified ?? <Unavailable />}</Row>
          </dl>
          <Corrections terrain={terrain} />
          <h4>Source data in this tile</h4>
          {terrain.sources.length === 0 ? (
            <p className="hint">The provider did not report sources for this tile.</p>
          ) : (
            <ul className="sources-list">
              {terrain.sources.map((file) => (
                <SourceFile key={file} file={file} />
              ))}
            </ul>
          )}
          <p className="hint">
            A tile can merge several datasets; the provider does not say which one supplied this
            exact pixel. Datums differ between them and are not harmonised by the producer.
          </p>
        </>
      )}

      <h3>Other elevation sources</h3>
      <p className="hint">
        Independent point queries. Differences between sources are expected and real.
      </p>
      {Object.entries(elevations).map(([id, e]) => {
        const meta = providerById(id);
        return (
          <div key={id} className="source-card">
            <div className="source-card__head">
              <strong>{meta.name}</strong>
              {e.status === 'loading' && <Status tone="progress">Querying</Status>}
              {e.status === 'none' && <Status tone="neutral">No data</Status>}
              {e.status === 'error' && <Status tone="danger">Error</Status>}
            </div>
            {e.status === 'ready' && (
              <dl className="rows">
                <Row label="Value">
                  <strong>{metres(e.sample.value, 1)}</strong>
                </Row>
                <Row label="Vertical reference">{e.sample.reference}</Row>
                <Row label="Model">{e.sample.surfaceModel}</Row>
                <Row label="Resolution">{e.sample.resolution}</Row>
                <Row label="Acquisition">{e.sample.acquisition ?? <Unavailable />}</Row>
                <Row label="Vertical accuracy">
                  {meta.accuracy.vertical ?? <Unavailable>Not stated by the provider</Unavailable>}
                </Row>
                {e.sample.detail && <Row label="Detail">{e.sample.detail}</Row>}
              </dl>
            )}
            {e.status === 'error' && <p className="hint">{e.message}</p>}
            {e.status === 'none' && (
              <p className="hint">The provider has no value at this point.</p>
            )}
          </div>
        );
      })}

      <h3>Current weather</h3>
      {weather.status === 'loading' && <p className="hint">Querying Open-Meteo…</p>}
      {weather.status === 'error' && <p className="hint">{weather.message}</p>}
      {weather.status === 'ready' && (
        <>
          <dl className="rows">
            {weather.sample.values.map((v) => (
              <Row key={v.label} label={v.label}>
                {v.value} {v.unit}
              </Row>
            ))}
            <Row label="Valid for">{formatTime(weather.sample.time)}</Row>
            {weather.sample.gridElevation !== null && (
              <Row label="Model grid elevation">{metres(weather.sample.gridElevation)}</Row>
            )}
          </dl>
          <p className="hint">
            Modelled values for the surrounding grid cell, not a station observation. Weather data
            by Open-Meteo.com.
          </p>
        </>
      )}
    </div>
  );
}

function Corrections({
  terrain,
}: {
  terrain: Extract<PointInspection['terrain'], { status: 'ready' }>;
}) {
  const notes: string[] = [];
  if (terrain.corrections & CORRECTION.bathymetry) {
    notes.push(
      `This tile’s high-zoom sources fill the sea with 0 m. The value shown is ETOPO1 bathymetry from the zoom-${terrain.correctionSources?.fromZoom} tile — real data at ~1.85 km resolution.`,
    );
  }
  if (terrain.corrections & CORRECTION.iceSurface) {
    notes.push(
      `ETOPO1 Bedrock here lies beneath an ice sheet. The value shown is the GMTED2010 ice surface from the zoom-${terrain.correctionSources?.fromZoom} tile, at much coarser resolution.`,
    );
  }
  if (terrain.corrections & CORRECTION.arcticDem) {
    notes.push(
      'ArcticDEM heights in this tile are WGS84 ellipsoidal; Continuum converted them to orthometric with EGM96 (H = h − N). Other datasets merged into the same tile may have been converted too.',
    );
  }
  if (!notes.length) return null;
  return (
    <div className="notice" role="note">
      <strong>Data quality</strong>
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

function SourceFile({ file }: { file: string }) {
  const info = terrainSourceFor(file);
  if (!info) {
    return (
      <li>
        <code>{file}</code>
        <p className="hint">
          This source is not catalogued in Continuum; its metadata is unavailable.
        </p>
      </li>
    );
  }
  return (
    <li>
      <strong>{info.name}</strong> <code>{file}</code>
      <dl className="rows rows--compact">
        <Row label="Resolution">{info.resolution}</Row>
        <Row label="Model">{info.surfaceModel}</Row>
        <Row label="Vertical datum">{info.verticalDatum}</Row>
        <Row label="Vertical accuracy">
          {info.verticalAccuracy ?? <Unavailable>Not documented</Unavailable>}
        </Row>
        <Row label="Horizontal accuracy">
          {info.horizontalAccuracy ?? <Unavailable>Not documented</Unavailable>}
        </Row>
        <Row label="Acquisition">{info.acquisition ?? <Unavailable />}</Row>
      </dl>
      {info.note && <p className="hint">{info.note}</p>}
      <ExternalLink href={info.reference}>Dataset documentation</ExternalLink>
    </li>
  );
}
