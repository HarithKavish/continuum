import { Dialog, ExternalLink } from '../common/ui';
import { uiStore } from '../../core/state/hooks';

export function AboutDialog() {
  return (
    <Dialog title="About Continuum">
      <p>
        Continuum is an explorable digital representation of the Earth, built only from real,
        publicly accessible data. It runs entirely in your browser: terrain, imagery and events are
        requested directly from the organisations that publish them, and nothing is stored once you
        leave.
      </p>
      <p>
        <strong>
          Represent reality using real data. Preserve its provenance. Make it explorable at every
          scale.
        </strong>
      </p>
      <h3>What you are looking at</h3>
      <ul>
        <li>
          Terrain from the Terrain Tiles composite DEM, converted to WGS84 ellipsoidal heights with
          the EGM96 geoid. Its resolution and accuracy vary by place; the inspector reports the
          exact source files under any point.
        </li>
        <li>
          Imagery from EOX Sentinel-2 cloudless, NASA GIBS daily satellite passes, and USGS
          orthoimagery.
        </li>
        <li>
          Earthquakes from the USGS (refreshed every minute) and natural events from NASA EONET.
        </li>
        <li>Bathymetry in the terrain itself (ETOPO1) and as a GEBCO 2026 image layer.</li>
      </ul>
      <h3>What it is not</h3>
      <p>
        Not a navigation chart, a hazard warning service, or a survey instrument. Where data is
        missing, coarse, or uncertain, Continuum says so rather than filling the gap.
      </p>
      <p>
        <button
          className="button button--secondary"
          onClick={() => uiStore.set({ dialog: 'sources' })}
        >
          Sources and licences
        </button>{' '}
        <ExternalLink href="https://github.com/HarithKavish/continuum">Source code</ExternalLink>
      </p>
    </Dialog>
  );
}
