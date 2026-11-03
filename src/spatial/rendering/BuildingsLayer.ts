// 3D buildings from OpenStreetMap at neighbourhood scale. Loads the zoom-14 vector tiles
// around the screen centre only while the camera is near the ground, drops tiles that
// leave the neighbourhood (aborting their requests and freeing their GPU geometry), and
// places each footprint on the terrain at its centroid.

import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  type Appearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  type CesiumWidget,
} from 'cesium';
import { appConfig } from '../../config/application';
import { feedsStore } from '../../core/state/appState';
import { isAbortError } from '../../core/net/RequestQueue';
import {
  fetchBuildingTile,
  resolveTileTemplate,
} from '../../providers/geography/openfreemapBuildings';
import { geoidUndulation, isGeoidReady } from '../geoid/egm96';
import { lonLatToTileFraction, wrapTileX } from '../terrain/terrarium';
import type { TerrariumTileSource } from '../terrain/TerrariumTileSource';
import { buildingAppearance } from './daylight';

interface TileEntry {
  controller: AbortController;
  primitive: Primitive | null;
  count: number;
}

export class BuildingsLayer {
  private readonly tiles = new Map<string, TileEntry>();
  private visible = true;
  /** Whether the camera is near enough the ground for buildings (with hysteresis). */
  private near = false;
  private realistic = false;
  private appearance: Appearance = buildingAppearance(false);

  constructor(
    private readonly viewer: CesiumWidget,
    private readonly terrain: TerrariumTileSource,
  ) {}

  get realisticLighting(): boolean {
    return this.realistic;
  }

  /** Shade buildings by day and night (realistic lighting), or always lit. */
  set realisticLighting(realistic: boolean) {
    if (realistic === this.realistic) return;
    this.realistic = realistic;
    this.appearance = buildingAppearance(realistic);
    for (const entry of this.tiles.values())
      if (entry.primitive) entry.primitive.appearance = this.appearance;
    this.viewer.scene.requestRender();
  }

  /** Called as the camera moves. `centre` is the point under the screen centre. */
  update(
    centre: { lon: number; lat: number } | null,
    heightAboveGround: number,
    exaggeration: number,
  ): void {
    const s = feedsStore.get().buildings;
    // Buildings appear below the threshold and go a third above it, so a camera hovering
    // near it does not make them flicker on and off.
    const limit = appConfig.buildings.maxCameraHeight * (this.near ? 4 / 3 : 1);
    const near = (this.near = heightAboveGround <= limit);
    // Primitives are not vertically exaggerated, so they would float or sink on exaggerated terrain.
    const show = s.enabled && near && exaggeration === 1 && centre !== null;
    if (!show) {
      if (this.tiles.size && (!s.enabled || exaggeration !== 1)) this.clear();
      this.setVisible(s.enabled && exaggeration === 1);
      return;
    }
    this.setVisible(true);
    const z = appConfig.buildings.zoom;
    const f = lonLatToTileFraction(centre.lon, centre.lat, z);
    const cx = Math.floor(f.x);
    const cy = Math.floor(f.y);
    const wanted = new Set<string>();
    const radius = 1; // 3x3 tiles ≈ 7 km across at the equator
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (wanted.size >= appConfig.buildings.maxTiles) break;
        wanted.add(`${z}/${wrapTileX(cx + dx, z)}/${cy + dy}`);
      }
    }
    for (const [key, entry] of this.tiles) {
      if (!wanted.has(key)) this.drop(key, entry);
    }
    for (const key of wanted) if (!this.tiles.has(key)) this.load(key);
  }

  private setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    for (const e of this.tiles.values()) if (e.primitive) e.primitive.show = visible;
  }

  private load(key: string): void {
    const [z, x, y] = key.split('/').map(Number) as [number, number, number];
    const entry: TileEntry = { controller: new AbortController(), primitive: null, count: 0 };
    this.tiles.set(key, entry);
    this.publish('loading');
    void (async () => {
      try {
        const [{ build }, footprints] = await Promise.all([
          resolveTileTemplate(entry.controller.signal),
          fetchBuildingTile(z, x, y, entry.controller.signal),
        ]);
        if (!footprints.length || entry.controller.signal.aborted || !isGeoidReady()) {
          this.publish('ready', build);
          return;
        }
        // Terrain under the footprints: Terrarium zoom 14 is the same tile as the vector tile.
        const bases = await Promise.all(
          footprints.map((b) =>
            this.terrain
              .sampleHeight(b.centroid[0], b.centroid[1], z, entry.controller.signal)
              .then((r) => r.height + geoidUndulation(b.centroid[1], b.centroid[0]))
              .catch((e: unknown) => {
                if (isAbortError(e)) throw e;
                return null;
              }),
          ),
        );
        const instances: GeometryInstance[] = [];
        footprints.forEach((b, i) => {
          const base = bases[i];
          if (base === null || base === undefined || b.height <= b.minHeight) return;
          const shade = 0.72 + 0.2 * Math.min(1, b.height / 120);
          instances.push(
            new GeometryInstance({
              geometry: new PolygonGeometry({
                polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(b.ring.flat())),
                height: base + b.minHeight,
                extrudedHeight: base + b.height,
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(
                  new Color(shade, shade * 1.01, shade * 1.03, 1),
                ),
              },
              id: `osm-building:${b.sourceRecordId}`,
            }),
          );
        });
        if (entry.controller.signal.aborted) return;
        if (instances.length) {
          entry.primitive = this.viewer.scene.primitives.add(
            new Primitive({
              geometryInstances: instances,
              appearance: this.appearance,
              asynchronous: true,
              releaseGeometryInstances: true,
            }),
          ) as Primitive;
          entry.primitive.show = this.visible;
          entry.count = instances.length;
        }
        this.publish('ready', build);
        this.viewer.scene.requestRender();
      } catch (error) {
        if (isAbortError(error)) return;
        this.tiles.delete(key);
        feedsStore.set((s) => ({
          buildings: {
            ...s.buildings,
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to load buildings',
          },
        }));
      }
    })();
  }

  private drop(key: string, entry: TileEntry): void {
    entry.controller.abort();
    if (entry.primitive) this.viewer.scene.primitives.remove(entry.primitive); // remove() destroys it
    this.tiles.delete(key);
    this.publish('ready');
  }

  clear(): void {
    for (const [key, entry] of this.tiles) this.drop(key, entry);
    this.publish('idle');
  }

  private publish(status: 'idle' | 'loading' | 'ready', build?: string): void {
    const count = [...this.tiles.values()].reduce((n, e) => n + e.count, 0);
    feedsStore.set((s) => ({
      buildings: {
        ...s.buildings,
        status,
        count,
        error: null,
        build: build ?? s.buildings.build,
        retrievedAt: status === 'ready' ? new Date().toISOString() : s.buildings.retrievedAt,
      },
    }));
  }

  destroy(): void {
    this.clear();
  }
}
