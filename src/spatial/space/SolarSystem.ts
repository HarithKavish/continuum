// The Sun, Moon and planets around the Cesium globe. Positions come from the JPL elements
// (ephemeris.ts) and Cesium's Simon (1994) series for the Sun and Moon, in the ICRF; each
// frame they are turned into Cesium's Earth-fixed world with the same ICRF→Earth rotation
// Cesium lights the globe with, so every body sits where it is at the clock's time and is
// lit from where the Sun really is. Orbits are the paths those same positions trace.

import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  EllipsoidGeometry,
  Geometry,
  GeometryAttribute,
  GeometryInstance,
  JulianDate,
  LabelCollection,
  LabelStyle,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  PointPrimitiveCollection,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  PrimitiveType,
  SceneTransforms,
  Simon1994PlanetaryPositions,
  Transforms,
  VerticalOrigin,
  type Label,
  type PointPrimitive,
  type Scene,
} from 'cesium';
import { fetchPlanetaryMap } from '../../providers/planetary/usgsPlanetaryMaps';
import { BODIES, SATURN_RINGS, type BodyDefinition, type BodyId } from './bodies';
import { AU, heliocentric, orbitalPeriodDays, type OrbitingId } from './ephemeris';
import { icrfToBodyFixed, transpose } from './orientation';

/** TDB − TAI: Cesium's JulianDate counts TAI; TT = TAI + 32.184 s and TDB − TT < 2 ms. */
const TDB_MINUS_TAI_DAYS = 32.184 / 86_400;
const MOON_SIDEREAL_DAYS = 27.321661;
const ORBIT_SAMPLES = 360;
/** Points and labels sit this far from the camera, towards their body. */
const OVERLAY_DISTANCE = 1e7;
/** Which name wins when two would overlap on screen (after the focused body). */
const LABEL_PRIORITY: BodyId[] = [
  'sun',
  'jupiter',
  'saturn',
  'earth',
  'uranus',
  'neptune',
  'mars',
  'venus',
  'mercury',
  'moon',
  'pluto',
];

/** Body material: a map (or plain colour) lit by the Sun's real direction, or a glowing Sun. */
const BODY_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec3 albedo = texture(image, materialInput.st).rgb * tint.rgb;
    vec3 normalEC = normalize(materialInput.normalEC);
    if (glow > 0.5) {
        // Linear limb darkening, u = 0.6: a display approximation of the Sun's disc.
        float mu = clamp(dot(normalEC, normalize(materialInput.positionToEyeEC)), 0.0, 1.0);
        material.diffuse = albedo * (1.0 - 0.6 * (1.0 - mu));
        return material;
    }
    vec3 sunEC = normalize(czm_viewRotation * sunDirection);
    float light = max(dot(normalEC, sunEC), 0.0);
    material.diffuse = albedo * mix(1.0, light, realistic);
    return material;
}`;

/** Ring material: brightness from the published albedo, opacity from optical depth. */
const RING_SOURCE = /* glsl */ `
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec4 ring = texture(image, vec2(materialInput.st.s, 0.5));
    vec3 sunEC = normalize(czm_viewRotation * sunDirection);
    // Lit face or the far face (light through the ring): both show, the far face dimmer.
    float facing = abs(dot(normalize(materialInput.normalEC), sunEC));
    float light = mix(1.0, 0.25 + 0.75 * sqrt(facing), realistic);
    material.diffuse = ring.rgb * light;
    material.alpha = ring.a;
    return material;
}`;

interface BodyState {
  def: BodyDefinition;
  primitive: Primitive | null;
  material: Material | null;
  rings: { primitive: Primitive; material: Material } | null;
  /** World (Earth-fixed) position and model matrix, updated each frame. */
  position: Cartesian3;
  modelMatrix: Matrix4;
  point: PointPrimitive;
  label: Label;
  map: 'none' | 'loading' | 'loaded' | 'failed';
  mapWidth: number;
  orbit: {
    primitive: Primitive;
    /** Clock (TDB Julian date) and wall-clock time (ms) of the last build. */
    builtAt: number;
    builtWhen: number;
    modelMatrix: Matrix4;
  } | null;
}

export interface BodyView {
  id: BodyId;
  /** World position this frame. */
  position: Cartesian3;
  /** Largest radius, metres. */
  radius: number;
}

function whitePixel(): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

/** One texture row across the rings, inner to outer edge: colour × albedo, alpha 1 − e^−τ. */
function ringTexture(inner: number, outer: number): HTMLCanvasElement {
  const width = 1024;
  const canvas = Object.assign(document.createElement('canvas'), { width, height: 1 });
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(width, 1);
  for (let x = 0; x < width; x++) {
    const r = inner + ((x + 0.5) / width) * (outer - inner);
    const ring = SATURN_RINGS.find((g) => r >= g.inner && r < g.outer);
    if (!ring) continue;
    const brightness = Math.min(1, ring.albedo * 1.6);
    data.data[x * 4] = Math.round(235 * brightness);
    data.data[x * 4 + 1] = Math.round(220 * brightness);
    data.data[x * 4 + 2] = Math.round(190 * brightness);
    data.data[x * 4 + 3] = Math.round(255 * (1 - Math.exp(-ring.opticalDepth)));
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** A flat annulus in the xy-plane (the body's equator), with s running inner → outer. */
function ringGeometry(inner: number, outer: number, segments = 256): Geometry {
  const positions = new Float64Array((segments + 1) * 2 * 3);
  const st = new Float32Array((segments + 1) * 2 * 2);
  const normals = new Float32Array((segments + 1) * 2 * 3);
  const indices = new Uint16Array(segments * 6);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    for (let k = 0; k < 2; k++) {
      const r = k === 0 ? inner : outer;
      const v = i * 2 + k;
      positions.set([r * Math.cos(a), r * Math.sin(a), 0], v * 3);
      st.set([k, i / segments], v * 2);
      normals.set([0, 0, 1], v * 3);
    }
    if (i < segments)
      indices.set([i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2], i * 6);
  }
  return new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: st,
      }),
      normal: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normals,
      }),
    } as never,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: new BoundingSphere(Cartesian3.ZERO, outer),
  });
}

export class SolarSystem {
  /** ICRF → Earth-fixed rotation at the last update. */
  readonly icrfToFixed = new Matrix3();
  /** The Sun's world position at the last update. */
  readonly sunPosition = new Cartesian3();
  private readonly bodies = new Map<BodyId, BodyState>();
  private readonly points: PointPrimitiveCollection;
  private readonly labels: LabelCollection;
  private readonly white = whitePixel();
  private realistic = true;
  private overlays = { orbits: true, labels: true, active: false };
  private jdTdb = 0;
  /** Where each body was in the ICRF, relative to Earth, at the last update (metres). */
  private readonly geocentric = new Map<BodyId, Cartesian3>();

  constructor(private readonly scene: Scene) {
    this.points = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    this.labels = scene.primitives.add(new LabelCollection()) as LabelCollection;
    // The Moon is drawn here with its LRO map; Cesium's own small Moon would sit inside it.
    if (scene.moon) scene.moon.show = false;
    for (const def of BODIES) this.addBody(def);
  }

  private addBody(def: BodyDefinition): void {
    const colour = Color.fromCssColorString(def.colour);
    const point = this.points.add({
      pixelSize: def.id === 'sun' ? 8 : 5,
      color: colour,
      outlineColor: Color.BLACK.withAlpha(0.6),
      outlineWidth: 1,
      show: false,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const label = this.labels.add({
      position: Cartesian3.ZERO,
      text: def.name,
      font: '500 13px system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK.withAlpha(0.8),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: { x: 0, y: -8 } as never,
      show: false,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const state: BodyState = {
      def,
      primitive: null,
      material: null,
      rings: null,
      position: new Cartesian3(),
      modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
      point,
      label,
      map: def.map ? 'none' : 'loaded',
      mapWidth: 0,
      orbit: null,
    };
    if (def.id !== 'earth') {
      state.material = new Material({
        fabric: {
          uniforms: {
            image: this.white,
            tint: colour,
            sunDirection: new Cartesian3(1, 0, 0),
            realistic: 1,
            glow: def.id === 'sun' ? 1 : 0,
          },
          source: BODY_SOURCE,
        },
        translucent: false,
      });
      state.primitive = this.scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: new EllipsoidGeometry({
              radii: new Cartesian3(...def.radii),
              vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
              stackPartitions: 64,
              slicePartitions: 128,
            }),
          }),
          appearance: new MaterialAppearance({
            material: state.material,
            materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
            flat: true,
            faceForward: false,
            translucent: false,
            closed: true,
          }),
          modelMatrix: state.modelMatrix,
          asynchronous: false,
        }),
      ) as Primitive;
    }
    if (def.id === 'saturn') {
      const inner = SATURN_RINGS[0].inner * 1000;
      const outer = SATURN_RINGS[SATURN_RINGS.length - 1]!.outer * 1000;
      const material = new Material({
        fabric: {
          uniforms: {
            image: ringTexture(inner / 1000, outer / 1000),
            sunDirection: new Cartesian3(1, 0, 0),
            realistic: 1,
          },
          source: RING_SOURCE,
        },
        translucent: true,
      });
      const primitive = this.scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({ geometry: ringGeometry(inner, outer) }),
          appearance: new MaterialAppearance({
            material,
            materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
            flat: true,
            faceForward: true,
            translucent: true,
            closed: false,
          }),
          modelMatrix: state.modelMatrix,
          asynchronous: false,
        }),
      ) as Primitive;
      state.rings = { primitive, material };
    }
    this.bodies.set(def.id, state);
  }

  /** Realistic lighting (true) or every body fully lit. */
  setRealistic(realistic: boolean): void {
    this.realistic = realistic;
    for (const s of this.bodies.values()) {
      if (s.material && s.def.id !== 'sun') s.material.uniforms['realistic'] = realistic ? 1 : 0;
      if (s.rings) s.rings.material.uniforms['realistic'] = realistic ? 1 : 0;
    }
  }

  /** Orbit lines, labels and points: shown only when `active` (away from Earth's surface). */
  setOverlays(overlays: { orbits: boolean; labels: boolean; active: boolean }): void {
    this.overlays = overlays;
  }

  get tdbJulianDate(): number {
    return this.jdTdb;
  }

  /** Position each body for `time` and decide what to draw for the camera. */
  update(time: JulianDate): void {
    this.jdTdb = JulianDate.totalDays(time) + TDB_MINUS_TAI_DAYS;
    const R =
      Transforms.computeIcrfToFixedMatrix(time, this.icrfToFixed) ??
      Transforms.computeTemeToPseudoFixedMatrix(time, this.icrfToFixed);
    const sunIcrf = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
      time,
      this.geocentricOf('sun'),
    );
    Matrix3.multiplyByVector(R, sunIcrf, this.sunPosition);
    Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
      time,
      this.geocentricOf('moon'),
    );
    this.geocentricOf('earth');
    for (const s of this.bodies.values()) {
      const def = s.def;
      const geo = this.geocentricOf(def.id);
      if (def.orbit !== 'cesium') {
        // The planet relative to the Sun, plus the Sun relative to Earth.
        const helio = heliocentric(def.orbit, this.jdTdb);
        geo.x = helio[0] * AU + sunIcrf.x;
        geo.y = helio[1] * AU + sunIcrf.y;
        geo.z = helio[2] * AU + sunIcrf.z;
      }
      Matrix3.multiplyByVector(R, geo, s.position);
      this.orient(s, time, R);
    }
    this.updateOrbits(time, R);
  }

  private geocentricOf(id: BodyId): Cartesian3 {
    let v = this.geocentric.get(id);
    if (!v) this.geocentric.set(id, (v = new Cartesian3()));
    return v;
  }

  private readonly scratchRotation = new Matrix3();
  private readonly scratchBody = new Matrix3();
  private readonly scratchDirection = new Cartesian3();

  private orient(s: BodyState, time: JulianDate, R: Matrix3): void {
    if (s.def.id === 'earth') return;
    // Earth-fixed ← ICRF ← body-fixed.
    let bodyToIcrf: Matrix3;
    if (s.def.rotation === 'cesium') {
      const icrfToMoon = Transforms.computeIcrfToMoonFixedMatrix(time, this.scratchBody);
      bodyToIcrf = Matrix3.transpose(icrfToMoon, this.scratchBody);
    } else {
      bodyToIcrf = Matrix3.fromRowMajorArray(
        transpose(icrfToBodyFixed(s.def.rotation, this.jdTdb)),
        this.scratchBody,
      );
    }
    const rotation = Matrix3.multiply(R, bodyToIcrf, this.scratchRotation);
    Matrix4.fromRotationTranslation(rotation, s.position, s.modelMatrix);
    if (s.primitive) s.primitive.modelMatrix = s.modelMatrix;
    if (s.rings) s.rings.primitive.modelMatrix = s.modelMatrix;
    if (s.def.id === 'sun') return; // the light source itself
    const toSun = Cartesian3.normalize(
      Cartesian3.subtract(this.sunPosition, s.position, this.scratchDirection),
      this.scratchDirection,
    );
    if (s.material) Cartesian3.clone(toSun, s.material.uniforms['sunDirection'] as Cartesian3);
    if (s.rings) Cartesian3.clone(toSun, s.rings.material.uniforms['sunDirection'] as Cartesian3);
  }

  /**
   * Orbit lines: the path each body's own positions trace over one period, centred on now,
   * rebuilt when the clock has moved 1% of that period. Heliocentric paths follow the Sun;
   * the Moon's path is geocentric.
   */
  private updateOrbits(time: JulianDate, R: Matrix3): void {
    const show = this.overlays.active && this.overlays.orbits;
    for (const s of this.bodies.values()) {
      const def = s.def;
      if (def.id === 'sun') continue;
      const period = def.id === 'moon' ? MOON_SIDEREAL_DAYS : orbitalPeriodDays(this.orbitOf(def));
      // At most four rebuilds a second, however fast the clock runs.
      const stale =
        !s.orbit ||
        (Math.abs(this.jdTdb - s.orbit.builtAt) > period / 100 &&
          performance.now() - s.orbit.builtWhen > 250);
      if (show && stale) this.buildOrbit(s, time, period);
      if (!s.orbit) continue;
      s.orbit.primitive.show = show;
      const origin = def.id === 'moon' ? Cartesian3.ZERO : this.sunPosition;
      Matrix4.fromRotationTranslation(R, origin, s.orbit.modelMatrix);
      s.orbit.primitive.modelMatrix = s.orbit.modelMatrix;
    }
  }

  private orbitOf(def: BodyDefinition): OrbitingId {
    return def.id === 'earth' ? 'emb' : (def.orbit as OrbitingId);
  }

  private buildOrbit(s: BodyState, time: JulianDate, period: number): void {
    const positions: Cartesian3[] = [];
    const t = new JulianDate();
    const sun = new Cartesian3();
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
      const days = period * (i / ORBIT_SAMPLES - 0.5);
      if (s.def.id === 'moon') {
        JulianDate.addDays(time, days, t);
        positions.push(Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(t));
      } else if (s.def.id === 'earth') {
        // Earth relative to the Sun is the Sun relative to Earth, reversed.
        JulianDate.addDays(time, days, t);
        Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(t, sun);
        positions.push(Cartesian3.negate(sun, new Cartesian3()));
      } else {
        const p = heliocentric(this.orbitOf(s.def), this.jdTdb + days);
        positions.push(new Cartesian3(p[0] * AU, p[1] * AU, p[2] * AU));
      }
    }
    if (s.orbit) this.scene.primitives.remove(s.orbit.primitive);
    const modelMatrix = Matrix4.clone(Matrix4.IDENTITY);
    const primitive = this.scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new PolylineGeometry({
            positions,
            width: 1.5,
            arcType: ArcType.NONE,
            vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.fromCssColorString(s.def.orbitColour).withAlpha(0.55),
            ),
          },
        }),
        appearance: new PolylineColorAppearance({ translucent: true }),
        modelMatrix,
        asynchronous: false,
      }),
    ) as Primitive;
    s.orbit = { primitive, builtAt: this.jdTdb, builtWhen: performance.now(), modelMatrix };
  }

  private readonly overlayOrigin = Matrix4.clone(Matrix4.IDENTITY);
  private readonly scratchRelative = new Cartesian3();

  /** After the camera is placed: points and labels for small bodies, and maps for large ones. */
  decorate(focus: BodyId | null): void {
    const camera = this.scene.camera;
    const fovy = (camera.frustum as { fovy?: number }).fovy ?? Math.PI / 3;
    const pixelsPerRadian = this.scene.canvas.clientHeight / 2 / Math.tan(fovy / 2);
    // Points and labels are drawn on the line of sight to each body, 10 000 km from the
    // camera: they ignore depth, so they land on the same pixel, and Cesium garbles text
    // drawn more than about 10¹² m away.
    Matrix4.fromTranslation(camera.positionWC, this.overlayOrigin);
    this.points.modelMatrix = this.overlayOrigin;
    this.labels.modelMatrix = this.overlayOrigin;
    for (const s of this.bodies.values()) {
      const radius = Math.max(...s.def.radii);
      const distance = Cartesian3.distance(camera.positionWC, s.position);
      const pixels = (radius / Math.max(distance, radius)) * pixelsPerRadian;
      const relative = Cartesian3.subtract(s.position, camera.positionWC, this.scratchRelative);
      Cartesian3.multiplyByScalar(
        Cartesian3.normalize(relative, relative),
        OVERLAY_DISTANCE,
        relative,
      );
      s.point.position = relative;
      s.label.position = relative;
      // A body's own orbit runs through its centre: hidden once the body fills the view.
      if (s.orbit && s.def.id === focus && pixels > 30) s.orbit.primitive.show = false;
      s.point.show = this.overlays.active && pixels < 3;
      s.label.show =
        this.overlays.active && this.overlays.labels && !(s.def.id === focus && pixels > 60);
      if (s.def.map && (pixels > 2 || s.def.id === focus)) this.ensureMap(s, pixels);
    }
    this.declutterLabels(focus);
  }

  private readonly scratchWindow = new Cartesian2();

  /** Hide names that would overlap a more important one on screen. */
  private declutterLabels(focus: BodyId | null): void {
    const order = focus ? [focus, ...LABEL_PRIORITY.filter((id) => id !== focus)] : LABEL_PRIORITY;
    const kept: Cartesian2[] = [];
    for (const id of order) {
      const s = this.bodies.get(id)!;
      if (!s.label.show) continue;
      const at = SceneTransforms.worldToWindowCoordinates(
        this.scene,
        s.position,
        this.scratchWindow,
      );
      if (!at) continue;
      const clear = kept.every((k) => Math.abs(k.x - at.x) > 70 || Math.abs(k.y - at.y) > 16);
      if (clear) kept.push(Cartesian2.clone(at));
      else s.label.show = false;
    }
  }

  /** Load a body's map once it covers a few pixels; the Moon and Mars get more detail close up. */
  private ensureMap(s: BodyState, pixels: number): void {
    const wanted = pixels > 300 && (s.def.id === 'moon' || s.def.id === 'mars') ? 4096 : 2048;
    if (s.map === 'loading' || s.map === 'failed' || s.mapWidth >= wanted) return;
    s.map = 'loading';
    fetchPlanetaryMap(s.def.map!, wanted)
      .then((canvas) => {
        if (!s.material) return;
        s.material.uniforms['image'] = canvas;
        s.material.uniforms['tint'] = Color.WHITE;
        s.map = 'loaded';
        s.mapWidth = wanted;
        this.scene.requestRender();
      })
      .catch(() => {
        // Keep the plain colour; the reader still sees the body where it is.
        s.map = s.mapWidth ? 'loaded' : 'failed';
      });
  }

  /** Where a body is this frame, for the camera. Earth is at the world origin. */
  view(id: BodyId): BodyView {
    const s = this.bodies.get(id)!;
    return { id, position: s.position, radius: Math.max(...s.def.radii) };
  }

  /** Distance between two bodies' centres, metres, at the last update. */
  distance(a: BodyId, b: BodyId): number {
    return Cartesian3.distance(this.bodies.get(a)!.position, this.bodies.get(b)!.position);
  }

  mapState(id: BodyId): BodyState['map'] {
    return this.bodies.get(id)!.map;
  }

  get isRealistic(): boolean {
    return this.realistic;
  }
}
