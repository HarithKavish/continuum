// Analog camera navigation shared by gamepad, keyboard and on-screen joysticks.
//
// Motion model:
//  - Pan moves the camera over the surface along its heading. Speed is proportional to
//    height above ground, so the same stick deflection feels right from orbit to street.
//  - Rotate orbits the camera around the target under the screen centre, about the
//    target's local vertical. Tilt orbits about the camera's right axis through the target.
//  - Zoom moves along the line to the target, exponentially, so it never overshoots.
//  - Every input is smoothed with a time constant and integrated with real frame time,
//    so behaviour is independent of frame rate. Idle input decays to exactly zero.
//  - After each step the camera is kept a minimum clearance above the terrain.

import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Ellipsoid,
  Math as CesiumMath,
  Matrix3,
  Quaternion,
  type Scene,
  type Camera,
} from 'cesium';
import { appConfig } from '../config/application';

export interface NavIntent {
  panX: number;
  panY: number;
  rotate: number;
  tilt: number;
  zoom: number;
}

export const ZERO_INTENT: Readonly<NavIntent> = Object.freeze({
  panX: 0,
  panY: 0,
  rotate: 0,
  tilt: 0,
  zoom: 0,
});

export function addIntents(...intents: NavIntent[]): NavIntent {
  const out = { panX: 0, panY: 0, rotate: 0, tilt: 0, zoom: 0 };
  for (const i of intents) {
    out.panX += i.panX;
    out.panY += i.panY;
    out.rotate += i.rotate;
    out.tilt += i.tilt;
    out.zoom += i.zoom;
  }
  for (const k of Object.keys(out) as (keyof NavIntent)[])
    out[k] = Math.max(-2, Math.min(2, out[k]));
  return out;
}

/** Exponential approach of `current` to `target` with time constant `tau`, frame-rate independent. */
export function smoothToward(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-dt / tau));
  return Math.abs(next) < 1e-4 && target === 0 ? 0 : next;
}

const RATES = {
  /** Full deflection pans one height-above-ground per second. */
  pan: 1.1,
  /** Radians per second at full deflection. */
  rotate: 1.4,
  tilt: 0.9,
  /** e-folds of distance per second at full trigger. */
  zoom: 1.5,
};

const MAX_TILT = CesiumMath.toRadians(88);

const scratch = {
  carto: new Cartographic(),
  normal: new Cartesian3(),
  east: new Cartesian3(),
  north: new Cartesian3(),
  forward: new Cartesian3(),
  right: new Cartesian3(),
  axis: new Cartesian3(),
  offset: new Cartesian3(),
  q: new Quaternion(),
  m: new Matrix3(),
  centre: new Cartesian2(),
  neg: new Cartesian3(),
};

export class CameraControls {
  speedIndex: number = appConfig.navigation.defaultSpeedIndex;
  readonly velocity: NavIntent = { ...ZERO_INTENT };

  constructor(private readonly scene: Scene) {}

  get speedMultiplier(): number {
    return appConfig.navigation.speedSteps[this.speedIndex] ?? 1;
  }

  changeSpeed(delta: number): number {
    this.speedIndex = Math.max(
      0,
      Math.min(appConfig.navigation.speedSteps.length - 1, this.speedIndex + delta),
    );
    return this.speedMultiplier;
  }

  /** True while any input is still decaying. */
  get moving(): boolean {
    return Object.values(this.velocity).some((v) => v !== 0);
  }

  update(dt: number, target: NavIntent): void {
    // Smoothing uses real elapsed time — the exponential form is stable for any step — so
    // input settles in the same wall-clock time at 5 fps as at 120 fps. Motion uses a
    // capped step so that a long stall (tab switch, debugger) cannot produce a jump.
    const tau = appConfig.navigation.smoothingSeconds;
    for (const k of Object.keys(this.velocity) as (keyof NavIntent)[]) {
      this.velocity[k] = smoothToward(this.velocity[k], target[k], Math.min(dt, 1), tau);
    }
    const step = Math.min(dt, 0.25);
    if (!this.moving) return;
    const camera = this.scene.camera;
    const v = this.velocity;
    const heightAboveGround = this.heightAboveGround();
    const speed = this.speedMultiplier;
    const pivot = this.centreTarget();

    if (v.panX !== 0 || v.panY !== 0) {
      this.pan(camera, v.panX, v.panY, heightAboveGround * RATES.pan * speed * step);
    }
    if (v.rotate !== 0) {
      this.orbitAboutVertical(camera, pivot, -v.rotate * RATES.rotate * Math.sqrt(speed) * step);
    }
    if (v.tilt !== 0) {
      this.tiltAbout(camera, pivot, v.tilt * RATES.tilt * Math.sqrt(speed) * step);
    }
    if (v.zoom !== 0) {
      this.zoom(camera, pivot, v.zoom * RATES.zoom * speed * step);
    }
    this.enforceClearance(camera);
  }

  /** Point on the globe under the screen centre, if the centre is over the Earth. */
  centreTarget(): Cartesian3 | undefined {
    const canvas = this.scene.canvas;
    scratch.centre.x = canvas.clientWidth / 2;
    scratch.centre.y = canvas.clientHeight / 2;
    const ray = this.scene.camera.getPickRay(scratch.centre);
    const hit = ray ? this.scene.globe.pick(ray, this.scene) : undefined;
    return hit ?? this.scene.camera.pickEllipsoid(scratch.centre, Ellipsoid.WGS84) ?? undefined;
  }

  heightAboveGround(): number {
    const carto = this.scene.camera.positionCartographic;
    const ground = this.scene.globe.getHeight(carto) ?? 0;
    return Math.max(1, carto.height - ground);
  }

  private pan(camera: Camera, x: number, y: number, distance: number): void {
    const position = camera.position;
    Ellipsoid.WGS84.geodeticSurfaceNormal(position, scratch.normal);
    // Local east and north at the camera.
    Cartesian3.cross(Cartesian3.UNIT_Z, scratch.normal, scratch.east);
    if (Cartesian3.magnitudeSquared(scratch.east) < 1e-12)
      Cartesian3.clone(Cartesian3.UNIT_X, scratch.east);
    Cartesian3.normalize(scratch.east, scratch.east);
    Cartesian3.cross(scratch.normal, scratch.east, scratch.north);
    const heading = camera.heading;
    // forward = north·cos(h) + east·sin(h); right = east·cos(h) − north·sin(h)
    Cartesian3.add(
      Cartesian3.multiplyByScalar(scratch.north, Math.cos(heading), scratch.forward),
      Cartesian3.multiplyByScalar(scratch.east, Math.sin(heading), scratch.axis),
      scratch.forward,
    );
    Cartesian3.subtract(
      Cartesian3.multiplyByScalar(scratch.east, Math.cos(heading), scratch.right),
      Cartesian3.multiplyByScalar(scratch.north, Math.sin(heading), scratch.axis),
      scratch.right,
    );
    const move = Cartesian3.add(
      Cartesian3.multiplyByScalar(scratch.forward, y, new Cartesian3()),
      Cartesian3.multiplyByScalar(scratch.right, x, scratch.axis),
      new Cartesian3(),
    );
    const magnitude = Cartesian3.magnitude(move);
    if (magnitude < 1e-9) return;
    Cartesian3.divideByScalar(move, magnitude, move);
    const radius = Cartesian3.magnitude(position);
    // Rotating about (p̂ × d̂) by +θ carries p towards d̂ along the great circle.
    const angle = Math.min(0.2, (distance * magnitude) / radius);
    const axis = Cartesian3.normalize(
      Cartesian3.cross(position, move, new Cartesian3()),
      new Cartesian3(),
    );
    this.rotateCamera(camera, Cartesian3.ZERO, axis, angle);
  }

  private orbitAboutVertical(camera: Camera, pivot: Cartesian3 | undefined, angle: number): void {
    const centre = pivot ?? camera.position;
    const axis = Ellipsoid.WGS84.geodeticSurfaceNormal(centre, new Cartesian3());
    this.rotateCamera(camera, centre, axis, angle);
  }

  private tiltAbout(camera: Camera, pivot: Cartesian3 | undefined, angle: number): void {
    if (!pivot) {
      // Over empty space: look up or down in place.
      camera.look(camera.right, -angle);
      return;
    }
    const up = Ellipsoid.WGS84.geodeticSurfaceNormal(pivot, scratch.normal);
    // Current tilt: 0 looking straight down, 90° at the horizon.
    const current = Math.acos(CesiumMath.clamp(-Cartesian3.dot(camera.direction, up), -1, 1));
    const clamped = CesiumMath.clamp(current + angle, 0, MAX_TILT) - current;
    if (Math.abs(clamped) < 1e-7) return;
    this.rotateCamera(camera, pivot, Cartesian3.clone(camera.right, scratch.axis), clamped);
  }

  private zoom(camera: Camera, pivot: Cartesian3 | undefined, amount: number): void {
    const maxHeight = appConfig.navigation.maxCameraHeightMeters;
    if (pivot) {
      const toPivot = Cartesian3.subtract(pivot, camera.position, scratch.offset);
      const distance = Cartesian3.magnitude(toPivot);
      const next = distance * Math.exp(-amount);
      const move = distance - next;
      if (move < 0 && camera.positionCartographic.height > maxHeight) return;
      Cartesian3.normalize(toPivot, toPivot);
      camera.move(toPivot, move);
    } else {
      const h = camera.positionCartographic.height;
      const delta = h * (1 - Math.exp(-amount));
      if (delta < 0 && h > maxHeight) return;
      camera.moveForward(delta);
    }
  }

  /** Rotate the camera's position about a line through `centre`, carrying its orientation with it. */
  private rotateCamera(camera: Camera, centre: Cartesian3, axis: Cartesian3, angle: number): void {
    Quaternion.fromAxisAngle(axis, angle, scratch.q);
    Matrix3.fromQuaternion(scratch.q, scratch.m);
    const offset = Cartesian3.subtract(camera.position, centre, scratch.offset);
    Matrix3.multiplyByVector(scratch.m, offset, offset);
    const position = Cartesian3.add(centre, offset, new Cartesian3());
    const direction = Matrix3.multiplyByVector(scratch.m, camera.direction, new Cartesian3());
    const up = Matrix3.multiplyByVector(scratch.m, camera.up, new Cartesian3());
    camera.setView({ destination: position, orientation: { direction, up } });
  }

  enforceClearance(camera: Camera): void {
    const carto = Cartographic.clone(camera.positionCartographic, scratch.carto);
    const ground = this.scene.globe.getHeight(carto);
    if (ground === undefined) return;
    const minimum = ground + appConfig.navigation.minClearanceMeters;
    if (carto.height < minimum) {
      carto.height = minimum;
      camera.setView({
        destination: Cartographic.toCartesian(carto),
        orientation: {
          direction: Cartesian3.clone(camera.direction),
          up: Cartesian3.clone(camera.up),
        },
      });
    }
  }
}
