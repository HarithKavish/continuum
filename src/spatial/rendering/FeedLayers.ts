// Earthquake and natural-event layers: polling, normalisation into ObservationRecords,
// and their Cesium entities. Records are held in memory only and replaced on each refresh.

import {
  CallbackProperty,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  CustomDataSource,
  DistanceDisplayCondition,
  HeightReference,
  LabelStyle,
  NearFarScalar,
  PolylineDashMaterialProperty,
  VerticalOrigin,
  Cartesian2,
  type Entity,
  type Viewer,
} from 'cesium';
import { appConfig } from '../../config/application';
import { createPoller, type Poller } from '../../core/lifecycle/poller';
import { feedsStore } from '../../core/state/appState';
import { ProviderError, type ObservationRecord } from '../../providers/base/types';
import { fetchEarthquakes } from '../../providers/earthquakes/usgs';
import { fetchOpenEvents } from '../../providers/natural-events/eonet';
import { isAbortError } from '../../core/net/RequestQueue';
import { depthColor, EVENT_COLORS, magnitudeSize, SELECTION_COLOR } from './palettes';

const NEAR_DEPTH_TEST = 60_000;

export class FeedLayers {
  readonly earthquakes = new CustomDataSource('earthquakes');
  readonly events = new CustomDataSource('natural-events');
  readonly highlight = new CustomDataSource('feed-highlight');
  readonly records = new Map<string, ObservationRecord>();
  private readonly quakePoller: Poller;
  private readonly eventPoller: Poller;
  private unsubscribe: () => void;
  private lastQuakeFeed: string;
  private lastCategories: string;

  constructor(private readonly viewer: Viewer) {
    void viewer.dataSources.add(this.earthquakes);
    void viewer.dataSources.add(this.events);
    void viewer.dataSources.add(this.highlight);
    this.quakePoller = createPoller(
      (signal) => this.loadEarthquakes(signal),
      appConfig.feeds.earthquakeRefreshMs,
    );
    this.eventPoller = createPoller(
      (signal) => this.loadEvents(signal),
      appConfig.feeds.eventsRefreshMs,
    );
    const s = feedsStore.get();
    this.lastQuakeFeed = s.earthquakeFeed;
    this.lastCategories = s.eventCategories.join(',');
    this.apply();
    this.unsubscribe = feedsStore.subscribe(() => this.apply());
  }

  private apply(): void {
    const s = feedsStore.get();
    this.earthquakes.show = s.earthquakes.enabled;
    this.events.show = s.events.enabled;
    if (s.earthquakes.enabled) this.quakePoller.start();
    else this.quakePoller.stop();
    if (s.events.enabled) this.eventPoller.start();
    else this.eventPoller.stop();
    if (s.earthquakeFeed !== this.lastQuakeFeed) {
      this.lastQuakeFeed = s.earthquakeFeed;
      this.quakePoller.refreshNow();
    }
    const categories = s.eventCategories.join(',');
    if (categories !== this.lastCategories) {
      this.lastCategories = categories;
      this.eventPoller.refreshNow();
    }
    this.viewer.scene.requestRender();
  }

  destroy(): void {
    this.unsubscribe();
    this.quakePoller.stop();
    this.eventPoller.stop();
  }

  refresh(): void {
    this.quakePoller.refreshNow();
    this.eventPoller.refreshNow();
  }

  private async loadEarthquakes(signal: AbortSignal): Promise<void> {
    const feed = feedsStore.get().earthquakeFeed;
    feedsStore.set((s) => ({ earthquakes: { ...s.earthquakes, status: 'loading', error: null } }));
    try {
      const result = await fetchEarthquakes(feed, signal);
      this.replace(this.earthquakes, 'earthquake', result.records, (r) => this.earthquakeEntity(r));
      feedsStore.set((s) => ({
        earthquakes: {
          ...s.earthquakes,
          status: 'ready',
          count: result.records.length,
          generated: result.generated,
          retrievedAt: new Date().toISOString(),
          error: result.skipped ? `${result.skipped} malformed record(s) skipped` : null,
        },
      }));
    } catch (error) {
      if (isAbortError(error)) return;
      feedsStore.set((s) => ({
        earthquakes: { ...s.earthquakes, status: 'error', error: messageOf(error) },
      }));
    }
  }

  private async loadEvents(signal: AbortSignal): Promise<void> {
    const { eventCategories } = feedsStore.get();
    feedsStore.set((s) => ({ events: { ...s.events, status: 'loading', error: null } }));
    try {
      const result = await fetchOpenEvents(
        eventCategories,
        appConfig.feeds.eventsLookbackDays,
        signal,
      );
      this.replace(this.events, 'natural-event', result.records, (r) => this.eventEntity(r));
      feedsStore.set((s) => ({
        events: {
          ...s.events,
          status: 'ready',
          count: result.records.length,
          generated: null,
          retrievedAt: result.retrievedAt,
          error: result.skipped
            ? `${result.skipped} record(s) without usable geometry skipped`
            : null,
        },
      }));
    } catch (error) {
      if (isAbortError(error)) return;
      feedsStore.set((s) => ({
        events: { ...s.events, status: 'error', error: messageOf(error) },
      }));
    }
  }

  private replace(
    source: CustomDataSource,
    kind: ObservationRecord['kind'],
    records: ObservationRecord[],
    build: (r: ObservationRecord) => Entity.ConstructorOptions,
  ): void {
    for (const [id, r] of this.records) if (r.kind === kind) this.records.delete(id);
    source.entities.suspendEvents();
    source.entities.removeAll();
    // Smaller events first so larger ones draw on top.
    const ordered = [...records].sort(
      (a, b) => (a.magnitude?.value ?? 0) - (b.magnitude?.value ?? 0),
    );
    for (const r of ordered) {
      this.records.set(r.id, r);
      source.entities.add(build(r));
    }
    source.entities.resumeEvents();
    this.viewer.scene.requestRender();
  }

  private earthquakeEntity(r: ObservationRecord): Entity.ConstructorOptions {
    const depthKm = r.elevationMeters === null ? null : -r.elevationMeters / 1000;
    const size = magnitudeSize(r.magnitude?.value ?? null);
    return {
      id: r.id,
      name: r.title,
      position: Cartesian3.fromDegrees(r.lon, r.lat),
      point: {
        pixelSize: size,
        color: Color.fromCssColorString(depthColor(depthKm)).withAlpha(0.85),
        outlineColor: Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: NEAR_DEPTH_TEST,
        scaleByDistance: new NearFarScalar(2e5, 1.4, 2e7, 0.7),
      },
    };
  }

  private eventEntity(r: ObservationRecord): Entity.ConstructorOptions {
    const color = Color.fromCssColorString(EVENT_COLORS[r.category] ?? '#ffffff');
    const options: Entity.ConstructorOptions = {
      id: r.id,
      name: r.title,
      position: Cartesian3.fromDegrees(r.lon, r.lat),
      point: {
        pixelSize: 9,
        color: color.withAlpha(0.95),
        outlineColor: Color.BLACK.withAlpha(0.7),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: NEAR_DEPTH_TEST,
      },
      label: {
        text: r.title,
        font: '12px sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 3,
        outlineColor: Color.BLACK,
        fillColor: Color.WHITE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 1_500_000),
        disableDepthTestDistance: NEAR_DEPTH_TEST,
      },
    };
    if (r.geometry?.type === 'LineString') {
      options.polyline = {
        positions: Cartesian3.fromDegreesArray(
          r.geometry.coordinates.flatMap((c) => [c[0]!, c[1]!]),
        ),
        width: 2,
        material: new PolylineDashMaterialProperty({ color: color.withAlpha(0.8) }),
        clampToGround: true,
      };
    } else if (r.geometry?.type === 'Polygon') {
      options.polygon = {
        hierarchy: Cartesian3.fromDegreesArray(
          r.geometry.coordinates[0]!.flatMap((c) => [c[0]!, c[1]!]),
        ),
        material: new ColorMaterialProperty(color.withAlpha(0.25)),
      };
    }
    return options;
  }

  /** Visual emphasis for a selected record: ring at the surface and, for earthquakes, a line to the hypocentre. */
  setHighlight(record: ObservationRecord | null): void {
    this.highlight.entities.removeAll();
    if (record) {
      const surface = Cartesian3.fromDegrees(record.lon, record.lat);
      this.highlight.entities.add({
        position: new ConstantPositionProperty(surface),
        point: {
          pixelSize: magnitudeSize(record.magnitude?.value ?? null) + 10,
          color: Color.TRANSPARENT,
          outlineColor: Color.fromCssColorString(SELECTION_COLOR),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      if (
        record.kind === 'earthquake' &&
        record.elevationMeters !== null &&
        record.elevationMeters < 0
      ) {
        const hypocentre = Cartesian3.fromDegrees(record.lon, record.lat, record.elevationMeters);
        const top = Cartesian3.fromDegrees(record.lon, record.lat, 0);
        const dashed = new PolylineDashMaterialProperty({ color: Color.WHITE.withAlpha(0.9) });
        this.highlight.entities.add({
          polyline: {
            positions: new CallbackProperty(() => [top, hypocentre], true),
            width: 2,
            material: dashed,
            depthFailMaterial: dashed,
          },
        });
        this.highlight.entities.add({
          position: hypocentre,
          point: {
            pixelSize: 8,
            color: Color.WHITE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
    }
    this.viewer.scene.requestRender();
  }
}

function messageOf(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return error instanceof Error ? error.message : 'Unknown error';
}
