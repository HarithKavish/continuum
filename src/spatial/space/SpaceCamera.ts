// Navigation among the bodies of the solar system. The camera orbits the focused body in
// axes fixed to the stars (the ICRF), so the body turns beneath it at its real rate, and it
// follows the body as it moves. Flights between bodies interpolate the camera's offset from
// the target in direction and in log-distance, so a jump of billions of kilometres reads
// as a smooth approach. Near Earth, navigation hands back to the Earth-fixed controls.

import { Cartesian3, Math as CesiumMath, Matrix3, type Scene } from 'cesium';
import type { NavIntent } from '../../gamepad/CameraControls';
import type { BodyId } from './bodies';
import type { SolarSystem } from './SolarSystem';

/** Spherical offset from the focused body, on ICRF axes. */
export interface Orbit {
  /** Radians around the ICRF z axis (celestial north). */
  azimuth: number;
  /** Radians above the ICRF equator, kept off the poles. */
  elevation: number;
  /** From the body's centre, metres. */
  distance: number;
}

const MAX_ELEVATION = CesiumMath.toRadians(88);
/** Radians a second at full stick, and per pixel of drag. */
const ORBIT_RATE = CesiumMath.toRadians(70);
const DRAG_RATE = CesiumMath.toRadians(0.3);
/** Distance factor a second at full zoom input. */
const ZOOM_RATE = 2.2;
const MAX_DISTANCE = 2e13;

export function offsetFor(o: Orbit): Cartesian3 {
  const c = Math.cos(o.elevation);
  return new Cartesian3(
    o.distance * c * Math.cos(o.azimuth),
    o.distance * c * Math.sin(o.azimuth),
    o.distance * Math.sin(o.elevation),
  );
}

export function orbitFor(offset: Cartesian3): Orbit {
  const distance = Cartesian3.magnitude(offset);
  return {
    azimuth: Math.atan2(offset.y, offset.x),
    elevation: Math.asin(CesiumMath.clamp(offset.z / distance, -1, 1)),
    distance,
  };
}

/** Normalised interpolation between two unit vectors (slerp), robust when they are opposite. */
function slerp(a: Cartesian3, b: Cartesian3, t: number): Cartesian3 {
  const dot = CesiumMath.clamp(Cartesian3.dot(a, b), -1, 1);
  if (dot > 0.9999)
    return Cartesian3.normalize(Cartesian3.lerp(a, b, t, new Cartesian3()), new Cartesian3());
  if (dot < -0.9999) {
    // Opposite directions: turn through any perpendicular.
    const p = Cartesian3.cross(
      a,
      Math.abs(a.z) < 0.9 ? Cartesian3.UNIT_Z : Cartesian3.UNIT_X,
      new Cartesian3(),
    );
    Cartesian3.normalize(p, p);
    return Cartesian3.add(
      Cartesian3.multiplyByScalar(a, Math.cos(Math.PI * t), new Cartesian3()),
      Cartesian3.multiplyByScalar(p, Math.sin(Math.PI * t), p),
      new Cartesian3(),
    );
  }
  const omega = Math.acos(dot);
  const s = Math.sin(omega);
  const r = Cartesian3.add(
    Cartesian3.multiplyByScalar(a, Math.sin((1 - t) * omega) / s, new Cartesian3()),
    Cartesian3.multiplyByScalar(b, Math.sin(t * omega) / s, new Cartesian3()),
    new Cartesian3(),
  );
  return Cartesian3.normalize(r, r);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Flight {
  target: BodyId;
  /** Start: camera offset from the target and view vectors, ICRF axes. */
  fromOffset: Cartesian3;
  fromDirection: Cartesian3;
  fromUp: Cartesian3;
  to: Orbit;
  elapsed: number;
  duration: number;
  /** Hand back to the Earth-fixed controls when the flight ends. */
  thenEarth: boolean;
}

export class SpaceCamera {
  /** The body being orbited; null while the Earth-fixed controls are in charge. */
  focus: BodyId | null = null;
  orbit: Orbit = { azimuth: 0, elevation: 0, distance: 1 };
  private flight: Flight | null = null;
  /** Input or a new focus has moved the view since the camera was last placed. */
  private dirty = true;
  private sincePlaced = 0;
  private readonly fixedToIcrf = new Matrix3();
  /** Called when control passes to or from the Earth-fixed controls. */
  onModeChange: ((space: boolean) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly system: SolarSystem,
  ) {}

  get active(): boolean {
    return this.focus !== null;
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Smallest distance from a body's centre the camera may come to. */
  minimumDistance(id: BodyId): number {
    return this.system.view(id).radius * (id === 'sun' ? 1.5 : 1.15);
  }

  /** A view of `id` that shows its lit face: from the Sun's side, a little off-axis. */
  defaultOrbit(id: BodyId): Orbit {
    const radius = this.system.view(id).radius;
    const distance = radius * (id === 'sun' ? 6 : 4);
    if (id === 'sun') return { azimuth: 0, elevation: 0.3, distance };
    const toSun = Cartesian3.subtract(
      this.system.sunPosition,
      this.system.view(id).position,
      new Cartesian3(),
    );
    const icrf = Matrix3.multiplyByVector(
      Matrix3.transpose(this.system.icrfToFixed, this.fixedToIcrf),
      toSun,
      new Cartesian3(),
    );
    const sun = orbitFor(icrf);
    return {
      azimuth: sun.azimuth + CesiumMath.toRadians(35),
      elevation: CesiumMath.clamp(sun.elevation + CesiumMath.toRadians(15), -1.2, 1.2),
      distance,
    };
  }

  /** Fly to a body. From the Earth-fixed controls this takes over navigation. */
  flyTo(id: BodyId, orbit: Orbit = this.defaultOrbit(id), thenEarth = false): void {
    const camera = this.scene.camera;
    const toIcrf = Matrix3.transpose(this.system.icrfToFixed, this.fixedToIcrf);
    const target = this.system.view(id).position;
    const fromOffset = Matrix3.multiplyByVector(
      toIcrf,
      Cartesian3.subtract(camera.positionWC, target, new Cartesian3()),
      new Cartesian3(),
    );
    const ratio = Math.max(orbit.distance, 1) / Math.max(Cartesian3.magnitude(fromOffset), 1);
    this.flight = {
      target: id,
      fromOffset,
      fromDirection: Matrix3.multiplyByVector(toIcrf, camera.directionWC, new Cartesian3()),
      fromUp: Matrix3.multiplyByVector(toIcrf, camera.upWC, new Cartesian3()),
      to: orbit,
      elapsed: 0,
      // Longer for bigger jumps: 2.5 s, plus 0.6 s per factor of ten in distance, up to 6 s.
      duration: Math.min(6, 2.5 + 0.6 * Math.abs(Math.log10(ratio))),
      thenEarth,
    };
    this.dirty = true;
    this.setFocus(id);
  }

  /** Take over from the Earth-fixed controls at the current view, orbiting Earth. */
  enterAroundEarth(): void {
    const toIcrf = Matrix3.transpose(this.system.icrfToFixed, this.fixedToIcrf);
    const offset = Matrix3.multiplyByVector(toIcrf, this.scene.camera.positionWC, new Cartesian3());
    this.flyTo('earth', orbitFor(offset));
    if (this.flight) this.flight.duration = 0.6;
  }

  /** Fly back to Earth and hand navigation back to the Earth-fixed controls. */
  returnToEarth(): void {
    const toIcrf = Matrix3.transpose(this.system.icrfToFixed, this.fixedToIcrf);
    const view = orbitFor(
      Matrix3.multiplyByVector(toIcrf, this.scene.camera.positionWC, new Cartesian3()),
    );
    const distance = this.system.view('earth').radius + 20_000_000;
    this.flyTo('earth', { ...view, distance }, true);
  }

  /** Hand navigation back to the Earth-fixed controls where the camera is now. */
  leave(): void {
    this.flight = null;
    this.setFocus(null);
  }

  private setFocus(id: BodyId | null): void {
    const was = this.active;
    this.focus = id;
    if (was !== this.active) this.onModeChange?.(this.active);
  }

  /** Stick, keyboard or touch-stick input while orbiting. */
  input(dt: number, intent: NavIntent): void {
    if (!this.focus || this.flight) return;
    const turn = ORBIT_RATE * dt;
    this.orbit.azimuth -= (intent.panX + intent.rotate) * turn;
    this.orbit.elevation = CesiumMath.clamp(
      this.orbit.elevation - (intent.panY + intent.tilt) * turn,
      -MAX_ELEVATION,
      MAX_ELEVATION,
    );
    if (intent.zoom) this.zoom(Math.exp(-intent.zoom * ZOOM_RATE * dt));
    this.dirty = true;
  }

  /** Mouse or touch drag, in pixels. */
  drag(dx: number, dy: number): void {
    if (!this.focus || this.flight) return;
    this.orbit.azimuth -= dx * DRAG_RATE;
    this.orbit.elevation = CesiumMath.clamp(
      this.orbit.elevation + dy * DRAG_RATE,
      -MAX_ELEVATION,
      MAX_ELEVATION,
    );
    this.dirty = true;
  }

  /** Multiply the distance from the focused body (below 1 comes closer). */
  zoom(factor: number): void {
    if (!this.focus || this.flight) return;
    this.orbit.distance = CesiumMath.clamp(
      this.orbit.distance * factor,
      this.minimumDistance(this.focus),
      MAX_DISTANCE,
    );
    this.dirty = true;
  }

  /**
   * Place the camera for this frame: during a flight, or orbiting the focused body. With
   * nothing moved by input, the camera follows its body at most every `maxIdleSeconds`
   * (bodies move slowly in real time; each placement costs a render).
   */
  update(dt: number, maxIdleSeconds = 0): void {
    if (!this.focus) return;
    this.sincePlaced += dt;
    if (!this.flight && !this.dirty && this.sincePlaced < maxIdleSeconds) return;
    this.sincePlaced = 0;
    this.dirty = false;
    const R = this.system.icrfToFixed;
    const target = this.system.view(this.focus).position;
    let offset: Cartesian3;
    let direction: Cartesian3;
    let up: Cartesian3;
    const flight = this.flight;
    if (flight) {
      flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.duration);
      const k = ease(t);
      const toOffset = offsetFor(flight.to);
      const fromDistance = Math.max(Cartesian3.magnitude(flight.fromOffset), 1);
      const distance = Math.exp(
        CesiumMath.lerp(Math.log(fromDistance), Math.log(flight.to.distance), k),
      );
      const along = slerp(
        Cartesian3.normalize(flight.fromOffset, new Cartesian3()),
        Cartesian3.normalize(toOffset, new Cartesian3()),
        k,
      );
      offset = Cartesian3.multiplyByScalar(along, distance, new Cartesian3());
      // Turn to face the target during the first part of the flight.
      const look = Cartesian3.negate(along, new Cartesian3());
      direction = slerp(flight.fromDirection, look, ease(Math.min(1, t / 0.45)));
      up = this.upFor(
        direction,
        Cartesian3.lerp(flight.fromUp, Cartesian3.UNIT_Z, k, new Cartesian3()),
      );
      if (t >= 1) {
        this.orbit = { ...flight.to };
        this.flight = null;
        if (flight.thenEarth) {
          this.place(R, target, offset, direction, up);
          this.setFocus(null);
          return;
        }
      }
    } else {
      offset = offsetFor(this.orbit);
      direction = Cartesian3.normalize(
        Cartesian3.negate(offset, new Cartesian3()),
        new Cartesian3(),
      );
      up = this.upFor(direction, Cartesian3.UNIT_Z);
    }
    this.place(R, target, offset, direction, up);
  }

  /** `hint` made perpendicular to `direction`. */
  private upFor(direction: Cartesian3, hint: Cartesian3): Cartesian3 {
    let up = Cartesian3.subtract(
      hint,
      Cartesian3.multiplyByScalar(direction, Cartesian3.dot(hint, direction), new Cartesian3()),
      new Cartesian3(),
    );
    if (Cartesian3.magnitude(up) < 1e-6)
      up = Cartesian3.cross(direction, Cartesian3.UNIT_X, new Cartesian3());
    return Cartesian3.normalize(up, up);
  }

  private place(
    R: Matrix3,
    target: Cartesian3,
    offsetIcrf: Cartesian3,
    directionIcrf: Cartesian3,
    upIcrf: Cartesian3,
  ): void {
    const destination = Cartesian3.add(
      target,
      Matrix3.multiplyByVector(R, offsetIcrf, new Cartesian3()),
      new Cartesian3(),
    );
    this.scene.camera.setView({
      destination,
      orientation: {
        direction: Matrix3.multiplyByVector(R, directionIcrf, new Cartesian3()),
        up: Matrix3.multiplyByVector(R, upIcrf, new Cartesian3()),
      },
    });
  }
}
