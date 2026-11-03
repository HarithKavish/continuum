// The Cesium scene and everything attached to it. React components never touch Cesium
// directly; they read stores and call methods here.

// Cesium's own widget styles only: Continuum uses none of the Viewer's widgets.
import 'cesium/Build/Cesium/Widgets/CesiumWidget/CesiumWidget.css';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  CesiumWidget,
  ClockRange,
  EllipsoidTerrainProvider,
  Ion,
  JulianDate,
  Math as CesiumMath,
  Rectangle,
  RequestScheduler,
  ScreenSpaceEventType,
  TimeInterval,
  Transforms,
  type Entity,
  type PerspectiveFrustum,
  type TerrainProvider,
} from 'cesium';
import { appConfig } from '../../config/application';
import { providerById } from '../../config/providers/catalog';
import { IMAGERY_LAYERS } from '../../config/providers/layers';
import {
  cancelInspection,
  cancelProfile,
  computeProfile,
  inspectPoint,
} from '../../core/inspection';
import {
  cameraStore,
  layersStore,
  selectionStore,
  showToast,
  spaceStore,
  statusStore,
  uiStore,
} from '../../core/state/appState';
import { savePreferences } from '../../core/state/preferences';
import {
  addIntents,
  CameraControls,
  ZERO_INTENT,
  type NavIntent,
} from '../../gamepad/CameraControls';
import { GamepadManager, gamepadStore } from '../../gamepad/GamepadManager';
import { shapeInput, type ButtonAction } from '../../gamepad/GamepadMapping';
import { KeyboardInput, virtualSticks } from '../../gamepad/KeyboardInput';
import { ImageryManager } from '../imagery/ImageryManager';
import { BODIES, type BodyId } from '../space/bodies';
import { CLOCK_RANGE, CLOCK_SPEEDS } from '../space/clock';
import { SolarSystem } from '../space/SolarSystem';
import { SpaceCamera } from '../space/SpaceCamera';
import { SpacePointer } from '../space/SpacePointer';
import { TerrariumTerrainProvider } from '../terrain/TerrariumTerrainProvider';
import { TerrariumTileSource } from '../terrain/TerrariumTileSource';
import { BuildingsLayer } from './BuildingsLayer';
import { nightShadeMaterial } from './daylight';
import { FeedLayers } from './FeedLayers';
import { MeasureLayer } from './MeasureLayer';

export type EngineAction =
  | ButtonAction
  | 'select'
  | 'back'
  | 'recenter'
  | 'togglePanel'
  | 'toggleLighting'
  | 'prevBody'
  | 'nextBody';

/**
 * Orbiting Earth closer than this (about 7 600 km up) hands navigation back to the
 * Earth-fixed controls; above it Earth turns beneath the camera at its real rate.
 */
const EARTH_HANDBACK_DISTANCE = 2.2 * 6_378_137;

export class Engine {
  /** Cesium's globe widget (named `viewer` for the diagnostics and tests that read it). */
  readonly viewer: CesiumWidget;
  readonly terrainSource: TerrariumTileSource;
  readonly terrainProvider: TerrariumTerrainProvider;
  readonly imagery: ImageryManager;
  readonly feeds: FeedLayers;
  readonly measure: MeasureLayer;
  readonly buildings: BuildingsLayer;
  readonly controls: CameraControls;
  readonly gamepad: GamepadManager;
  readonly solarSystem: SolarSystem;
  readonly space: SpaceCamera;
  private readonly keyboard: KeyboardInput;
  private readonly spacePointer: SpacePointer;
  private lastSpaceTick = performance.now();
  private lastSpacePublish = 0;
  private lastOrientationCheck = 0;
  private readonly unsubscribers: (() => void)[] = [];
  private frameHandle = 0;
  /** Count of input frames processed; lets tests wait until input has been sampled. */
  inputFrames = 0;
  private lastFrame = performance.now();
  private renderCount = 0;
  private fpsWindowStart = performance.now();
  private lastCameraPublish = 0;
  private lastPrune = 0;
  private lastTileActivity = 0;
  private destroyed = false;

  static isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }

  constructor(container: HTMLElement, creditContainer: HTMLElement) {
    // No Cesium ion services are used; an empty token makes accidental use fail loudly.
    Ion.defaultAccessToken = '';
    RequestScheduler.maximumRequestsPerServer = appConfig.imagery.maxRequestsPerServer;

    this.terrainSource = new TerrariumTileSource({
      urlTemplate: appConfig.terrain.url,
      maxConcurrent: appConfig.terrain.maxConcurrent,
      maxCachedTiles: appConfig.terrain.maxCachedTiles,
    });
    this.terrainProvider = new TerrariumTerrainProvider(this.terrainSource, {
      credit: providerById('aws-terrain-tiles').attribution.short,
    });

    const lowPower = statusStore.get().lowPower;
    // CesiumWidget rather than Viewer: the same globe, clock and data sources without the
    // Viewer's widgets (and their Knockout dependency), which Continuum never shows.
    this.viewer = new CesiumWidget(container, {
      baseLayer: false,
      terrainProvider: this.terrainProvider as unknown as TerrainProvider,
      scene3DOnly: true,
      creditContainer,
      // The clock runs in real time, so the Sun lights the globe as it does now.
      shouldAnimate: true,
      // Render only when something changes: an idle globe costs almost nothing. The Sun
      // moves a quarter of a degree a minute, so a frame every 10 s keeps the terminator
      // where it is.
      requestRenderMode: true,
      maximumRenderTimeChange: 10,
      msaaSamples: lowPower ? 1 : 4,
      contextOptions: { webgl: { powerPreference: 'high-performance' } },
    });

    this.loadEarthOrientation(this.viewer.clock.currentTime);
    const scene = this.viewer.scene;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.baseColor = scene.globe.baseColor.withAlpha(1);
    scene.screenSpaceCameraController.minimumZoomDistance = 20;
    scene.screenSpaceCameraController.maximumZoomDistance =
      appConfig.navigation.maxCameraHeightMeters;
    this.viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    this.imagery = new ImageryManager(this.viewer);
    this.imagery.onError = () => statusStore.set({ imageryErrors: this.imagery.errorCount });
    this.feeds = new FeedLayers(this.viewer);
    this.measure = new MeasureLayer(this.viewer);
    this.buildings = new BuildingsLayer(this.viewer, this.terrainSource);
    this.controls = new CameraControls(scene);
    this.gamepad = new GamepadManager();
    this.keyboard = new KeyboardInput(window, (a) => this.action(a));

    // The rest of the solar system, and navigation among it. The far plane reaches past
    // Pluto from anywhere; Cesium's logarithmic depth keeps near detail sharp.
    (scene.camera.frustum as PerspectiveFrustum).far = 1e14;
    const clock = this.viewer.clock;
    clock.startTime = JulianDate.fromIso8601(CLOCK_RANGE.start);
    clock.stopTime = JulianDate.fromIso8601(CLOCK_RANGE.stop);
    clock.clockRange = ClockRange.CLAMPED;
    this.solarSystem = new SolarSystem(scene);
    this.space = new SpaceCamera(scene, this.solarSystem);
    this.space.onModeChange = (space) => this.onSpaceMode(space);
    this.spacePointer = new SpacePointer(
      scene.canvas,
      this.space,
      () => this.atEarthLimit(),
      () => scene.requestRender(),
    );
    scene.preUpdate.addEventListener((_scene, time) => this.spaceTick(time));
    this.unsubscribers.push(spaceStore.subscribe(() => this.applySpaceOptions()));
    this.applySpaceOptions();

    this.applyRenderSettings();
    this.applyLayers();
    this.unsubscribers.push(layersStore.subscribe(() => this.applyLayers()));
    this.unsubscribers.push(statusStore.subscribe(() => this.applyRenderSettings()));
    this.unsubscribers.push(
      selectionStore.subscribe(() => {
        const s = selectionStore.get();
        this.measure.render(s.tool, s.measurePoints);
        const i = s.inspection;
        this.measure.setMarker(i?.kind === 'point' ? { lon: i.lon, lat: i.lat } : null);
        this.feeds.setHighlight(i?.kind === 'record' ? i.record : null);
      }),
    );

    this.terrainProvider.activityChanged.addEventListener(() => {
      const a = this.terrainProvider.activity;
      statusStore.set({
        terrain: {
          inFlight: a.inFlight,
          queued: a.queued,
          delivered: a.delivered,
          failed: a.failed,
          cancelled: a.cancelled,
          deepestLevel: a.deepestLevel,
        },
      });
    });

    scene.postRender.addEventListener(() => this.afterRender());
    // In request-render mode a tile that finishes loading after the last frame would
    // never be drawn. Keep frames coming while the load queue moves, and briefly after.
    scene.globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      this.lastTileActivity = performance.now();
      if (queued >= 0) scene.requestRender();
    });
    this.installPointerHandlers();

    const { lon, lat, height } = appConfig.initialView;
    this.viewer.camera.setView({ destination: Cartesian3.fromDegrees(lon, lat, height) });
    statusStore.set({ engine: 'ready' });
    // Read-only handle for diagnostics and the end-to-end tests.
    (window as Window & { continuum?: unknown }).continuum = {
      engine: this,
      fromDegrees: (lon: number, lat: number, height = 0) =>
        Cartesian3.fromDegrees(lon, lat, height),
    };
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- frame loop

  /**
   * Input is sampled every animation frame, independently of Cesium rendering (which
   * only happens when something changes). A frame is requested whenever input moves the
   * camera.
   */
  private frame = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.inputFrames++;
    const intents: NavIntent[] = [this.keyboard.intent(), virtualSticks.intent()];

    const pad = this.gamepad.poll(now);
    const gs = gamepadStore.get();
    if (pad) {
      const edges = this.gamepad.pressedEdges(pad, gs.profile);
      if (edges.has('pause')) {
        this.gamepad.setPaused(!gs.paused);
        showToast(
          gs.paused
            ? 'Controller navigation resumed.'
            : 'Controller navigation paused. Press Start to resume.',
        );
      }
      if (!gamepadStore.get().paused) {
        const modifier = this.gamepad.isHeld(pad, 'modifier', gs.profile);
        for (const action of edges) {
          if (action === 'pause') continue;
          const sideways = action === 'fineLeft' || action === 'fineRight';
          if (modifier && sideways) this.cycleBaseLayer(action === 'fineRight' ? 1 : -1);
          // In space the D-pad's left and right step through the bodies.
          else if (sideways && this.space.active)
            this.action(action === 'fineRight' ? 'nextBody' : 'prevBody');
          else this.action(action);
        }
        const shaped = shapeInput(pad, gs.profile);
        const fine = { ...ZERO_INTENT };
        if (!modifier) {
          if (this.gamepad.isHeld(pad, 'fineUp', gs.profile)) fine.panY += 0.25;
          if (this.gamepad.isHeld(pad, 'fineDown', gs.profile)) fine.panY -= 0.25;
          if (!this.space.active) {
            if (this.gamepad.isHeld(pad, 'fineLeft', gs.profile)) fine.panX -= 0.25;
            if (this.gamepad.isHeld(pad, 'fineRight', gs.profile)) fine.panX += 0.25;
          }
        }
        intents.push(shaped, fine);
      }
    }

    const intent = addIntents(...intents);
    const active = Object.values(intent).some((v) => v !== 0);
    if (this.space.active) {
      if (active) {
        this.space.input(dt, intent);
        this.viewer.scene.requestRender();
      }
    } else if (intent.zoom < 0 && this.atEarthLimit()) {
      // Zooming out past the highest Earth view continues into space.
      this.space.enterAroundEarth();
    } else if (active || this.controls.moving) {
      this.controls.update(dt, intent);
      this.viewer.scene.requestRender();
    }

    // Night lights for the camera height, and the clouds: the latest hour, or a replay of
    // the last hours (never in low-power mode). They render only while something changes.
    if (
      this.imagery.tick(
        dt,
        this.viewer.camera.positionCartographic.height,
        statusStore.get().lowPower,
      )
    )
      this.viewer.scene.requestRender();
    const cloudTime = this.imagery.cloudTime();
    if (cloudTime !== statusStore.get().cloudTime) statusStore.set({ cloudTime });

    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private afterRender(): void {
    const now = performance.now();
    this.renderCount++;
    if (now - this.fpsWindowStart >= 1000) {
      const elapsed = (now - this.fpsWindowStart) / 1000;
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      statusStore.set({
        fps: Math.round(this.renderCount / elapsed),
        tilesLoaded: this.viewer.scene.globe.tilesLoaded,
        memoryMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      });
      this.renderCount = 0;
      this.fpsWindowStart = now;
    }
    if (now - this.lastCameraPublish > 100) {
      this.lastCameraPublish = now;
      this.publishCamera();
    }
    if (now - this.lastPrune > 500) {
      this.lastPrune = now;
      this.terrainProvider.pruneOutside(this.viewer.camera.computeViewRectangle() ?? undefined);
      const target = this.controls.centreTarget();
      const carto = target ? Cartographic.fromCartesian(target) : undefined;
      this.buildings.update(
        carto
          ? {
              lon: CesiumMath.toDegrees(carto.longitude),
              lat: CesiumMath.toDegrees(carto.latitude),
            }
          : null,
        this.controls.heightAboveGround(),
        layersStore.get().exaggeration,
      );
    }
    if (!this.viewer.scene.globe.tilesLoaded || now - this.lastTileActivity < 3000) {
      // Keep frames coming while tiles stream in, and for a moment after, so textures
      // that finish uploading are drawn.
      this.viewer.scene.requestRender();
    }
  }

  private publishCamera(): void {
    const camera = this.viewer.camera;
    const carto = camera.positionCartographic;
    const ground = this.viewer.scene.globe.getHeight(carto);
    cameraStore.set({
      lat: CesiumMath.toDegrees(carto.latitude),
      lon: CesiumMath.toDegrees(carto.longitude),
      height: carto.height,
      heightAboveGround: ground === undefined ? null : carto.height - ground,
      heading: CesiumMath.toDegrees(camera.heading),
      pitch: CesiumMath.toDegrees(camera.pitch),
    });
  }

  // ---------------------------------------------------------------- settings

  private applyLayers(): void {
    const s = layersStore.get();
    this.imagery.sync(s);
    const scene = this.viewer.scene;
    const wantTerrain = s.terrainEnabled;
    const hasTerrain = (scene.terrainProvider as unknown) === this.terrainProvider;
    if (wantTerrain !== hasTerrain) {
      scene.terrainProvider = wantTerrain
        ? (this.terrainProvider as unknown as TerrainProvider)
        : new EllipsoidTerrainProvider();
    }
    scene.verticalExaggeration = s.exaggeration;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = s.atmosphere;
    scene.globe.showGroundAtmosphere = s.atmosphere;
    scene.fog.enabled = s.atmosphere;
    this.applyLighting(s.lighting);
    savePreferences({
      lighting: s.lighting,
      baseLayer: s.baseLayer,
      overlays: Object.entries(s.overlays)
        .filter(([, o]) => o.enabled)
        .map(([id]) => id),
      knownOverlays: Object.keys(s.overlays),
    });
    scene.requestRender();
  }

  /**
   * Cesium places the Sun in the ICRF and turns it into Earth-fixed coordinates with the IAU
   * 2006 precession-nutation tables it ships (same origin, 67 KB per 1,000 days). Until they
   * load it uses an approximate rotation that ignores precession since 2000 (about 0.36° by
   * 2026).
   */
  private loadEarthOrientation(time: JulianDate): void {
    const interval = new TimeInterval({
      start: JulianDate.addDays(time, -1, new JulianDate()),
      stop: JulianDate.addDays(time, 2, new JulianDate()),
    });
    Transforms.preloadIcrfFixed(interval)
      .then(() => this.viewer.scene.requestRender())
      .catch(() => undefined); // keep the approximate rotation
  }

  /**
   * Realistic: the Sun's position at the clock's time shades the globe, buildings and
   * clouds at every distance, and the night side shows city lights. Full day: all lit.
   */
  private applyLighting(realistic: boolean): void {
    const globe = this.viewer.scene.globe;
    this.solarSystem.setRealistic(realistic);
    if (globe.enableLighting === realistic && this.buildings.realisticLighting === realistic)
      return;
    globe.enableLighting = realistic;
    globe.material = realistic
      ? nightShadeMaterial(globe.lightingFadeOutDistance, globe.lightingFadeInDistance)
      : undefined;
    this.buildings.realisticLighting = realistic;
  }

  private applyRenderSettings(): void {
    const { lowPower } = statusStore.get();
    const scene = this.viewer.scene;
    // Low-power mode trades sharpness for frame rate on modest GPUs.
    this.viewer.resolutionScale = lowPower
      ? Math.min(1, 0.75 / Math.max(1, window.devicePixelRatio / 1.5))
      : 1;
    this.viewer.useBrowserRecommendedResolution = true;
    scene.globe.maximumScreenSpaceError = lowPower ? 4 : 2;
    scene.msaaSamples = lowPower ? 1 : 4;
    savePreferences({ lowPower });
    scene.requestRender();
  }

  private cycleBaseLayer(direction: number): void {
    const bases = IMAGERY_LAYERS.filter((l) => l.role === 'base');
    const index = bases.findIndex((l) => l.providerId === layersStore.get().baseLayer);
    const next = bases[(index + direction + bases.length) % bases.length]!;
    layersStore.set({ baseLayer: next.providerId });
    showToast(`Imagery: ${next.label}`);
  }

  // ---------------------------------------------------------------- space

  /**
   * Every Cesium tick, before the camera is checked for changes: place the bodies for the
   * clock's time, then the camera that follows them, then their points, labels and maps.
   */
  private spaceTick(time: JulianDate): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastSpaceTick) / 1000);
    this.lastSpaceTick = now;
    this.solarSystem.update(time);
    // In real time the bodies barely move: follow them twice a second. Faster, every frame.
    const clock = this.viewer.clock;
    this.space.update(dt, !clock.shouldAnimate ? Infinity : clock.multiplier > 1 ? 0 : 0.5);
    if (
      this.space.focus === 'earth' &&
      !this.space.flying &&
      this.space.orbit.distance < EARTH_HANDBACK_DISTANCE
    )
      this.space.leave();
    this.solarSystem.decorate(this.space.focus);
    if (now - this.lastOrientationCheck > 2000) {
      this.lastOrientationCheck = now;
      // The precise rotation needs the IAU 2006 table for the clock's date; load it when
      // the clock has moved to a date not yet loaded (Cesium uses an approximation meanwhile).
      if (!Transforms.computeIcrfToFixedMatrix(time)) this.loadEarthOrientation(time);
    }
    if (now - this.lastSpacePublish > 250) {
      this.lastSpacePublish = now;
      this.publishSpace(time);
    }
  }

  private publishSpace(time: JulianDate): void {
    const clock = this.viewer.clock;
    const focus = this.space.focus;
    const live =
      clock.shouldAnimate &&
      clock.multiplier === 1 &&
      Math.abs(JulianDate.secondsDifference(time, JulianDate.now())) < 60;
    spaceStore.set({
      focus,
      flying: this.space.flying,
      speed: clock.multiplier,
      paused: !clock.shouldAnimate,
      time: JulianDate.toIso8601(time, 0),
      live,
      distance: focus
        ? Cartesian3.distance(this.viewer.camera.positionWC, this.solarSystem.view(focus).position)
        : null,
      fromEarth: focus && focus !== 'earth' ? this.solarSystem.distance('earth', focus) : null,
    });
  }

  private onSpaceMode(space: boolean): void {
    // Cesium's mouse and touch controller works in Earth-fixed axes; in space SpacePointer
    // takes over.
    this.viewer.scene.screenSpaceCameraController.enableInputs = !space;
    this.applySpaceOptions();
    this.publishSpace(this.viewer.clock.currentTime);
    this.viewer.scene.requestRender();
  }

  private applySpaceOptions(): void {
    const { orbits, labels } = spaceStore.get();
    this.solarSystem.setOverlays({ orbits, labels, active: this.space.active });
    savePreferences({ space: { orbits, labels } });
    this.viewer.scene.requestRender();
  }

  /** Whether the Earth view is as high as it goes. */
  private atEarthLimit(): boolean {
    return (
      this.viewer.camera.positionCartographic.height >=
      0.97 * appConfig.navigation.maxCameraHeightMeters
    );
  }

  /** Fly to a body; from Earth this switches to space navigation. */
  flyToBody(id: BodyId): void {
    this.space.flyTo(id);
    this.publishSpace(this.viewer.clock.currentTime);
  }

  /** Fly back to Earth and return to the Earth-fixed controls. */
  returnToEarth(): void {
    if (this.space.active) this.space.returnToEarth();
  }

  private stepBody(direction: number): void {
    const ids = BODIES.map((b) => b.id);
    const index = ids.indexOf(this.space.focus ?? 'earth');
    const next = ids[(index + direction + ids.length) % ids.length]!;
    this.flyToBody(next);
    showToast(`Flying to ${BODIES.find((b) => b.id === next)!.name}`);
  }

  /** Run the clock at `speed` simulated seconds per real second. */
  setClockSpeed(speed: number): void {
    const clock = this.viewer.clock;
    clock.multiplier = speed;
    clock.shouldAnimate = true;
    this.publishSpace(clock.currentTime);
  }

  private stepClockSpeed(direction: number): void {
    const index = CLOCK_SPEEDS.indexOf(this.viewer.clock.multiplier);
    const next =
      CLOCK_SPEEDS[Math.min(CLOCK_SPEEDS.length - 1, Math.max(0, index + direction))] ?? 1;
    this.setClockSpeed(next);
    showToast(next === 1 ? 'Time: real time' : `Time: ×${next.toLocaleString('en')}`);
  }

  toggleClockPaused(): void {
    const clock = this.viewer.clock;
    clock.shouldAnimate = !clock.shouldAnimate;
    this.publishSpace(clock.currentTime);
  }

  /** Back to the present moment, in real time. */
  clockToNow(): void {
    const clock = this.viewer.clock;
    clock.currentTime = JulianDate.now();
    clock.multiplier = 1;
    clock.shouldAnimate = true;
    this.loadEarthOrientation(clock.currentTime);
    this.publishSpace(clock.currentTime);
    this.viewer.scene.requestRender();
  }

  // ---------------------------------------------------------------- actions

  action(action: EngineAction): void {
    switch (action) {
      case 'select':
        this.selectAtScreenCentre();
        break;
      case 'back':
        this.back();
        break;
      case 'recenter':
        if (this.space.active) this.space.returnToEarth();
        else this.recenter();
        break;
      case 'prevBody':
      case 'nextBody':
        this.stepBody(action === 'nextBody' ? 1 : -1);
        break;
      case 'togglePanel':
        uiStore.set((s) => ({ rightOpen: !s.rightOpen }));
        break;
      case 'toggleLighting': {
        const lighting = !layersStore.get().lighting;
        layersStore.set({ lighting });
        showToast(lighting ? 'Realistic day and night' : 'Full daylight');
        break;
      }
      case 'slower':
      case 'faster': {
        // In space the bumpers change how fast time runs.
        if (this.space.active) {
          this.stepClockSpeed(action === 'faster' ? 1 : -1);
          break;
        }
        const speed = this.controls.changeSpeed(action === 'faster' ? 1 : -1);
        showToast(`Navigation speed ×${speed}`);
        statusStore.set({ navSpeed: speed });
        break;
      }
      default:
        break;
    }
  }

  back(): void {
    const s = selectionStore.get();
    if (s.measurePoints.length) {
      cancelProfile();
      selectionStore.set({ measurePoints: [], profile: null });
    } else if (s.inspection) {
      cancelInspection();
      selectionStore.set({ inspection: null });
    } else if (s.tool !== 'inspect') {
      selectionStore.set({ tool: 'inspect' });
    }
  }

  recenter(): void {
    const target = this.controls.centreTarget();
    const camera = this.viewer.camera;
    const carto = target ? Cartographic.fromCartesian(target) : camera.positionCartographic;
    const height = target
      ? Cartesian3.distance(camera.position, target) + (carto.height ?? 0)
      : camera.positionCartographic.height;
    camera.flyTo({
      destination: Cartesian3.fromRadians(carto.longitude, carto.latitude, Math.max(height, 300)),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: 1.2,
    });
  }

  flyTo(
    lat: number,
    lon: number,
    options: { height?: number; bbox?: [number, number, number, number] | null } = {},
  ): void {
    if (options.bbox) {
      const [south, north, west, east] = options.bbox;
      const rect = Rectangle.fromDegrees(west, south, east, north);
      // Very small boxes (a building) would put the camera inside the ground.
      if (Rectangle.computeWidth(rect) > 1e-4 || Rectangle.computeHeight(rect) > 1e-4) {
        this.viewer.camera.flyTo({ destination: rect, duration: 2 });
        return;
      }
    }
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, options.height ?? 25_000),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: 2,
    });
  }

  /**
   * Place the camera instantly. Cesium's collision check reads the globe height computed
   * for the previous camera position on the first frame after a teleport, which would
   * push the camera up to the old location's ground height; it is suspended for that
   * frame.
   */
  jumpTo(lon: number, lat: number, height: number, headingDeg = 0, pitchDeg = -90): void {
    const controller = this.viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = false;
    this.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(lon, lat, height),
      orientation: {
        heading: CesiumMath.toRadians(headingDeg),
        pitch: CesiumMath.toRadians(pitchDeg),
        roll: 0,
      },
    });
    const restore = this.viewer.scene.postRender.addEventListener(() => {
      restore();
      requestAnimationFrame(() => (controller.enableCollisionDetection = true));
    });
    this.viewer.scene.requestRender();
  }

  zoomBy(factor: number): void {
    const pivot = this.controls.centreTarget();
    const camera = this.viewer.camera;
    if (pivot) {
      const distance = Cartesian3.distance(camera.position, pivot);
      camera.zoomIn(distance * (1 - 1 / factor));
    } else {
      camera.zoomIn(camera.positionCartographic.height * (1 - 1 / factor));
    }
    this.controls.enforceClearance(camera);
    this.viewer.scene.requestRender();
  }

  // ---------------------------------------------------------------- picking

  private installPointerHandlers(): void {
    const handler = this.viewer.screenSpaceEventHandler;
    handler.setInputAction(
      (e: { position: Cartesian2 }) => this.handleClick(e.position),
      ScreenSpaceEventType.LEFT_CLICK,
    );
    let lastMove = 0;
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      const now = performance.now();
      if (now - lastMove < 60) return;
      lastMove = now;
      const point = this.pickGlobe(e.endPosition);
      cameraStore.set({ pointer: point });
    }, ScreenSpaceEventType.MOUSE_MOVE);
  }

  private pickGlobe(position: Cartesian2): { lat: number; lon: number } | null {
    const ray = this.viewer.camera.getPickRay(position);
    const hit = ray ? this.viewer.scene.globe.pick(ray, this.viewer.scene) : undefined;
    const cartesian = hit ?? this.viewer.camera.pickEllipsoid(position);
    if (!cartesian) return null;
    const c = Cartographic.fromCartesian(cartesian);
    return { lat: CesiumMath.toDegrees(c.latitude), lon: CesiumMath.toDegrees(c.longitude) };
  }

  private handleClick(position: Cartesian2): void {
    if (this.space.active) return; // nothing to inspect off Earth yet
    const { tool } = selectionStore.get();
    if (tool === 'inspect') {
      const picked = this.viewer.scene.pick(position) as { id?: Entity | string } | undefined;
      const id = typeof picked?.id === 'string' ? picked.id : picked?.id?.id;
      const record = id ? this.feeds.records.get(id) : undefined;
      if (record) {
        cancelInspection();
        selectionStore.set({ inspection: { kind: 'record', record } });
        uiStore.set({ rightOpen: true });
        return;
      }
    }
    const point = this.pickGlobe(position);
    if (point) this.useLocation(point);
  }

  private selectAtScreenCentre(): void {
    const canvas = this.viewer.scene.canvas;
    this.handleClick(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
  }

  /** Apply the active tool to a location chosen by click, crosshair or search. */
  useLocation(point: { lat: number; lon: number }): void {
    const s = selectionStore.get();
    if (s.tool === 'inspect') {
      inspectPoint(this.terrainSource, point.lat, point.lon);
      uiStore.set({ rightOpen: true });
      return;
    }
    const measurePoints = [...s.measurePoints, { lon: point.lon, lat: point.lat }];
    selectionStore.set({ measurePoints });
    if (s.tool === 'profile' && measurePoints.length >= 2)
      void computeProfile(this.terrainSource, measurePoints);
    uiStore.set({ rightOpen: true });
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameHandle);
    this.unsubscribers.forEach((u) => u());
    this.keyboard.dispose();
    this.spacePointer.dispose();
    this.gamepad.dispose();
    this.feeds.destroy();
    this.buildings.destroy();
    this.terrainSource.clear();
    this.viewer.destroy();
  }
}
