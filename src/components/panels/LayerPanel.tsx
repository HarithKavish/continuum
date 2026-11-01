import { IMAGERY_LAYERS, type ImageryLayerDefinition } from '../../config/providers/layers';
import { providerById } from '../../config/providers/catalog';
import {
  feedsStore,
  layersStore,
  statusStore,
  uiStore,
  useFeeds,
  useLayers,
  useStatus,
  useUi,
} from '../../core/state/hooks';
import { EARTHQUAKE_FEEDS, type EarthquakeFeed } from '../../providers/earthquakes/usgs';
import { EONET_CATEGORIES } from '../../providers/natural-events/eonet';
import { DEPTH_CLASSES, EVENT_COLORS } from '../../spatial/rendering/palettes';
import { mercatorPixelSpacingMeters } from '../../spatial/terrain/terrarium';
import { relativeTime, Section, Slider, Status, Toggle } from '../common/ui';
import { SearchBox } from './SearchBox';
import type { FeedState } from '../../core/state/appState';

const GROUPS: ImageryLayerDefinition['group'][] = [
  'Geographic features',
  'Hydrology',
  'Bathymetry and ocean',
  'Weather',
];

export function LayerPanel() {
  const open = useUi((s) => s.leftOpen);
  return (
    <aside
      className={`panel-shell panel-shell--left${open ? '' : ' is-collapsed'}`}
      aria-label="Layers and data"
    >
      <button
        className="panel-toggle"
        aria-expanded={open}
        aria-controls="layer-panel"
        onClick={() => uiStore.set((s) => ({ leftOpen: !s.leftOpen }))}
      >
        {open ? 'Hide layers' : 'Layers'}
      </button>
      <div id="layer-panel" className="panel-body" hidden={!open}>
        <SearchBox />
        <TerrainSection />
        <ImagerySection />
        {GROUPS.map((g) => (
          <OverlaySection key={g} group={g} />
        ))}
        <EventsSection />
        <DisplaySection />
      </div>
    </aside>
  );
}

function TerrainSection() {
  const { terrainEnabled, exaggeration } = useLayers((s) => ({
    terrainEnabled: s.terrainEnabled,
    exaggeration: s.exaggeration,
  }));
  const terrain = useStatus((s) => s.terrain);
  const deepestZoom = Math.max(0, terrain.deepestLevel - 1);
  return (
    <Section
      title="Terrain"
      aside={
        terrainEnabled ? <Status tone="live">Real</Status> : <Status tone="neutral">Off</Status>
      }
    >
      <Toggle
        checked={terrainEnabled}
        onChange={(v) => layersStore.set({ terrainEnabled: v })}
        label="Elevation (Terrain Tiles)"
        hint={
          terrainEnabled
            ? 'Global composite DEM with seabed, converted to WGS84 ellipsoidal heights with EGM96.'
            : 'Off: the globe is the bare WGS84 ellipsoid, which has no elevation.'
        }
      />
      <Slider
        label="Vertical exaggeration"
        value={exaggeration}
        min={1}
        max={10}
        step={0.5}
        format={(v) => (v === 1 ? 'True scale' : `×${v}`)}
        onChange={(v) => layersStore.set({ exaggeration: v })}
      />
      {exaggeration !== 1 && (
        <p className="hint">
          Exaggerated for visibility; heights are no longer to scale. 3D buildings are hidden.
        </p>
      )}
      {terrainEnabled && (
        <p className="hint" aria-live="polite">
          {terrain.inFlight + terrain.queued > 0
            ? `Streaming: ${terrain.inFlight} loading, ${terrain.queued} queued. `
            : 'Up to date. '}
          Finest tile so far: zoom {deepestZoom} (grid ≈{' '}
          {Math.round(mercatorPixelSpacingMeters(0, deepestZoom))} m at the equator).
          {terrain.failed > 0 &&
            ` ${terrain.failed} tile(s) failed; coarser terrain is shown there.`}
        </p>
      )}
    </Section>
  );
}

function ImagerySection() {
  const { baseLayer, baseOpacity, imageryDate } = useLayers((s) => ({
    baseLayer: s.baseLayer,
    baseOpacity: s.baseOpacity,
    imageryDate: s.imageryDate,
  }));
  const bases = IMAGERY_LAYERS.filter((l) => l.role === 'base');
  const anyDated = bases.find((b) => b.providerId === baseLayer)?.dated;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Section title="Satellite imagery">
      <fieldset className="radio-list">
        <legend className="visually-hidden">Base imagery</legend>
        {bases.map((l) => (
          <label key={l.providerId} className="radio">
            <input
              type="radio"
              name="base-imagery"
              checked={baseLayer === l.providerId}
              onChange={() => layersStore.set({ baseLayer: l.providerId })}
            />
            <span>
              {l.label}
              {l.hint && <small>{l.hint}</small>}
            </span>
          </label>
        ))}
      </fieldset>
      <DateField visible={!!anyDated} value={imageryDate} max={today} />
      <Slider
        label="Imagery opacity"
        value={baseOpacity}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => layersStore.set({ baseOpacity: v })}
      />
    </Section>
  );
}

function DateField({ visible, value, max }: { visible: boolean; value: string; max: string }) {
  if (!visible) return null;
  return (
    <label className="field">
      <span>Imagery date (UTC)</span>
      <input
        type="date"
        value={value}
        min="2000-02-24"
        max={max}
        onChange={(e) => e.target.value && layersStore.set({ imageryDate: e.target.value })}
      />
      <small>
        Daily layers show the satellite passes of this date. Today’s may still be processing.
      </small>
    </label>
  );
}

function OverlaySection({ group }: { group: ImageryLayerDefinition['group'] }) {
  const overlays = useLayers((s) => s.overlays);
  const imageryDate = useLayers((s) => s.imageryDate);
  const defs = IMAGERY_LAYERS.filter((l) => l.role === 'overlay' && l.group === group);
  const buildings = useFeeds((s) => s.buildings);
  const set = (id: string, patch: Partial<{ enabled: boolean; opacity: number }>) =>
    layersStore.set((s) => ({
      overlays: { ...s.overlays, [id]: { ...s.overlays[id]!, ...patch } },
    }));
  const anyDatedOn = defs.some((d) => d.dated && overlays[d.providerId]?.enabled);
  return (
    <Section title={group} defaultOpen={group === 'Geographic features'}>
      {defs.map((d) => {
        const o = overlays[d.providerId]!;
        return (
          <div key={d.providerId} className="overlay">
            <Toggle
              checked={o.enabled}
              onChange={(v) => set(d.providerId, { enabled: v })}
              label={d.label}
              hint={d.hint}
            />
            {o.enabled && d.legend && (
              <div className="legend" aria-label={`${d.label} legend`}>
                {d.legend.map((c) => (
                  <span key={c.label} className="legend__item">
                    <i style={{ background: c.color }} aria-hidden="true" />
                    {c.label}
                  </span>
                ))}
              </div>
            )}
            {o.enabled && (
              <Slider
                label="Opacity"
                value={o.opacity}
                min={0.1}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => set(d.providerId, { opacity: v })}
              />
            )}
          </div>
        );
      })}
      {anyDatedOn && (
        <p className="hint">
          Dated overlays show {imageryDate} (change it under Satellite imagery).
        </p>
      )}
      {group === 'Geographic features' && (
        <Toggle
          checked={buildings.enabled}
          onChange={(v) => feedsStore.set((s) => ({ buildings: { ...s.buildings, enabled: v } }))}
          label="3D buildings (OpenStreetMap)"
          hint={
            buildings.status === 'error'
              ? `Unavailable: ${buildings.error}`
              : buildings.count > 0
                ? `${buildings.count.toLocaleString('en')} buildings in view. Heights are often OpenMapTiles estimates.`
                : 'Appear when the camera is within 3 km of the ground.'
          }
        />
      )}
      {group === 'Bathymetry and ocean' && (
        <p className="hint">
          The terrain already carries the seabed (ETOPO1, 1′). Raise the vertical exaggeration to
          see ocean-floor relief; GEBCO 2026 is shown as an image only.
        </p>
      )}
    </Section>
  );
}

function feedStatus(f: FeedState, noun: string) {
  if (!f.enabled) return <Status tone="neutral">Off</Status>;
  if (f.status === 'loading' && !f.count) return <Status tone="progress">Loading</Status>;
  if (f.status === 'error') return <Status tone="danger">Error</Status>;
  return (
    <Status tone="live">
      {f.count.toLocaleString('en')} {noun}
    </Status>
  );
}

function EventsSection() {
  const { earthquakes, earthquakeFeed, events, eventCategories } = useFeeds((s) => ({
    earthquakes: s.earthquakes,
    earthquakeFeed: s.earthquakeFeed,
    events: s.events,
    eventCategories: s.eventCategories,
  }));
  const toggleCategory = (id: string) =>
    feedsStore.set((s) => ({
      eventCategories: s.eventCategories.includes(id)
        ? s.eventCategories.filter((c) => c !== id)
        : [...s.eventCategories, id],
    }));
  return (
    <Section title="Natural events" aside={feedStatus(events, 'events')}>
      <div className="feed">
        <Toggle
          checked={earthquakes.enabled}
          onChange={(v) =>
            feedsStore.set((s) => ({ earthquakes: { ...s.earthquakes, enabled: v } }))
          }
          label={<>Earthquakes {feedStatus(earthquakes, 'quakes')}</>}
          hint={
            earthquakes.error
              ? earthquakes.error
              : earthquakes.generated
                ? `USGS feed generated ${relativeTime(earthquakes.generated)}; refreshed every minute while visible.`
                : providerById('usgs-earthquakes').attribution.short
          }
        />
        {earthquakes.enabled && (
          <>
            <label className="field">
              <span>Feed</span>
              <select
                value={earthquakeFeed}
                onChange={(e) =>
                  feedsStore.set({ earthquakeFeed: e.target.value as EarthquakeFeed })
                }
              >
                {Object.entries(EARTHQUAKE_FEEDS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="legend" aria-label="Earthquake depth legend">
              <span className="legend__title">Depth · size by magnitude</span>
              {DEPTH_CLASSES.map((c) => (
                <span key={c.label} className="legend__item">
                  <i style={{ background: c.color }} aria-hidden="true" />
                  {c.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="feed">
        <Toggle
          checked={events.enabled}
          onChange={(v) => feedsStore.set((s) => ({ events: { ...s.events, enabled: v } }))}
          label="NASA EONET open events (past 30 days)"
          hint={
            events.error ??
            (events.retrievedAt ? `Retrieved ${relativeTime(events.retrievedAt)}.` : undefined)
          }
        />
        {events.enabled && (
          <div
            className="chips"
            role="group"
            aria-label="Event categories (none selected shows all)"
          >
            {Object.entries(EONET_CATEGORIES).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip${eventCategories.includes(id) ? ' is-on' : ''}`}
                aria-pressed={eventCategories.includes(id)}
                onClick={() => toggleCategory(id)}
              >
                <i style={{ background: EVENT_COLORS[id] }} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
        {events.enabled && eventCategories.length === 0 && (
          <p className="hint">All categories shown. Select some to filter.</p>
        )}
      </div>
    </Section>
  );
}

function DisplaySection() {
  const { atmosphere, lighting } = useLayers((s) => ({
    atmosphere: s.atmosphere,
    lighting: s.lighting,
  }));
  const lowPower = useStatus((s) => s.lowPower);
  return (
    <Section title="Display" defaultOpen={false}>
      <Toggle
        checked={atmosphere}
        onChange={(v) => layersStore.set({ atmosphere: v })}
        label="Atmosphere and fog"
      />
      <Toggle
        checked={lighting}
        onChange={(v) => layersStore.set({ lighting: v })}
        label="Sun lighting"
        hint="Shades the globe by the Sun's position when the page was opened."
      />
      <Toggle
        checked={lowPower}
        onChange={(v) => statusStore.set({ lowPower: v })}
        label="Low-performance mode"
        hint="Lower resolution and coarser terrain for modest GPUs."
      />
    </Section>
  );
}
