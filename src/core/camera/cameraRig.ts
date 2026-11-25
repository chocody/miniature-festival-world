import {
  CAMERA_FLIGHT_OFFSET,
  CAMERA_PAN_EASE_TIME_CONSTANT_MS,
  CAMERA_PAN_EDGE_RESISTANCE,
  CAMERA_PAN_MAX_OVERSHOOT,
  CAMERA_PAN_MAX_RELEASE_SPEED,
  CAMERA_PAN_RELEASE_IDLE_MS,
  CAMERA_PAN_REST_EPSILON,
  CAMERA_PAN_STOP_SPEED,
} from "@/config/camera.config";
import { MS_PER_SECOND } from "@/core/coordinates/splineConstants";
import type { WorldXZ } from "@/core/coordinates";

/*
 * MFW-57 camera rig: a focus point + yaw orbit with the fixed CAMERA_FLIGHT_OFFSET. Render-only state, never persisted
 * (invariant A). Pure, no three import, and no allocation outside createCameraRigState, getRiverPanBounds,
 * getCameraRigPose and getRotateStepPose (AC5): every per-event / per-frame function mutates in place.
 */

export type CameraRigPhase = "MANUAL" | "FLIGHT" | "COAST";

export interface CameraRigPose {
  readonly focusX: number;
  readonly focusY: number;
  readonly focusZ: number;
  readonly yawRad: number;
}

export interface CameraRigState {
  focusX: number;
  focusY: number;
  focusZ: number;
  yawRad: number;
  phase: CameraRigPhase;
  /** Spring destination while FLIGHT (so a rotate/fly started mid-flight builds on where it is going). */
  targetFocusX: number;
  targetFocusY: number;
  targetFocusZ: number;
  targetYawRad: number;
  /** COAST velocity of the focus, world units per second. */
  velocityX: number;
  velocityZ: number;
  /** Timestamp (ms, PointerEvent.timeStamp clock) of the last PAN_RIVER of the current drag; NaN outside a drag. */
  lastPanTime: number;
  /** Set when user input interrupts a FLIGHT; CameraRig calls api.stop() on its next frame and clears it. */
  stopFlightRequested: boolean;
}

export interface CameraPanBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export interface MutableXZ {
  x: number;
  z: number;
}
export interface MutableXYZ {
  x: number;
  y: number;
  z: number;
}
/** Structural subset of a three Camera (tests pass a real OrthographicCamera). */
export interface CameraPoseTarget {
  readonly position: { set(x: number, y: number, z: number): unknown };
  lookAt(x: number, y: number, z: number): void;
  updateMatrixWorld(): void;
}
export interface RiverChannelLike {
  readonly controlPoints: readonly WorldXZ[];
  readonly width: number;
}

const OFFSET_X = Number(CAMERA_FLIGHT_OFFSET[0]);
const OFFSET_Y = Number(CAMERA_FLIGHT_OFFSET[1]);
const OFFSET_Z = Number(CAMERA_FLIGHT_OFFSET[2]);

/** Module scratch (never escapes): keeps the per-event / per-frame paths allocation-free. */
const scratchOffset: MutableXYZ = { x: 0, y: 0, z: 0 };
const scratchDelta: MutableXZ = { x: 0, z: 0 };
const scratchAxis = { value: 0, velocity: 0 };

export function createCameraRigState(): CameraRigState {
  return {
    focusX: 0,
    focusY: 0,
    focusZ: 0,
    yawRad: 0,
    phase: "MANUAL",
    targetFocusX: 0,
    targetFocusY: 0,
    targetFocusZ: 0,
    targetYawRad: 0,
    velocityX: 0,
    velocityZ: 0,
    lastPanTime: Number.NaN,
    stopFlightRequested: false,
  };
}

/**
 * Soft pan bounds of the focus: the centreline x-range (along the river, +x) × the centreline z-range ± half the channel width.
 * The screen centre therefore stays over or next to the water. MFW-58 may widen x or set it to ±Infinity.
 */
export function getRiverPanBounds(channel: RiverChannelLike): CameraPanBounds {
  if (channel.controlPoints.length === 0) throw new RangeError("river channel needs at least one control point");
  if (!Number.isFinite(channel.width) || channel.width <= 0) throw new RangeError("river channel width must be finite and > 0");
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of channel.controlPoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const half = channel.width / 2;
  return { minX, maxX, minZ: minZ - half, maxZ: maxZ + half };
}

export function isInsidePanBounds(x: number, z: number, bounds: CameraPanBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** CAMERA_FLIGHT_OFFSET rotated about +Y by yawRad (three's makeRotationY). Returns `out`. */
export function getRotatedCameraOffsetInto(yawRad: number, out: MutableXYZ): MutableXYZ {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  out.x = OFFSET_X * c + OFFSET_Z * s;
  out.y = OFFSET_Y;
  out.z = -OFFSET_X * s + OFFSET_Z * c;
  return out;
}

/**
 * Focus change that keeps the ground point under the finger under the finger (exact for the orthographic camera): a finger
 * delta (CSS px) at `zoom` (CSS px per world unit). Writes (0, 0) for an invalid zoom or delta. Returns `out`.
 */
export function getPanFocusDelta(deltaXPx: number, deltaYPx: number, zoom: number, yawRad: number, out: MutableXZ): MutableXZ {
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(deltaXPx) || !Number.isFinite(deltaYPx)) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const o = getRotatedCameraOffsetInto(yawRad, scratchOffset);
  const h = Math.hypot(o.x, o.z);
  const sinAlpha = o.y / Math.hypot(o.x, o.y, o.z);
  const fx = -o.x / h;
  const fz = -o.z / h;
  const rx = o.z / h;
  const rz = -o.x / h;
  out.x = (-rx * deltaXPx + (fx * deltaYPx) / sinAlpha) / zoom;
  out.z = (-rz * deltaXPx + (fz * deltaYPx) / sinAlpha) / zoom;
  return out;
}

/** One axis of a drag with rubber-band resistance past [min, max] and an overshoot cap. Inward motion is never resisted. */
export function dragAxisWithResistance(value: number, delta: number, min: number, max: number): number {
  if (!Number.isFinite(delta)) return value;
  const next = value + delta;
  if (delta > 0 && next > max) {
    const inside = Math.max(0, Math.min(delta, max - value));
    const capped = Math.min(value + inside + (delta - inside) * CAMERA_PAN_EDGE_RESISTANCE, max + CAMERA_PAN_MAX_OVERSHOOT);
    return Math.max(value, capped);
  }
  if (delta < 0 && next < min) {
    const inside = Math.max(0, Math.min(-delta, value - min));
    const capped = Math.max(value - inside + (delta + inside) * CAMERA_PAN_EDGE_RESISTANCE, min - CAMERA_PAN_MAX_OVERSHOOT);
    return Math.min(value, capped);
  }
  return next;
}

/** User input takes the camera: a running flight is asked to stop, a coast ends. */
export function takeManualControl(rig: CameraRigState): void {
  if (rig.phase === "FLIGHT") rig.stopFlightRequested = true;
  rig.phase = "MANUAL";
  rig.velocityX = 0;
  rig.velocityZ = 0;
}

export function applyPanDrag(
  rig: CameraRigState,
  deltaXPx: number,
  deltaYPx: number,
  zoom: number,
  timeMs: number,
  bounds: CameraPanBounds,
): void {
  const previousVelocityX = rig.velocityX;
  const previousVelocityZ = rig.velocityZ;
  takeManualControl(rig);
  const d = getPanFocusDelta(deltaXPx, deltaYPx, zoom, rig.yawRad, scratchDelta);
  const beforeX = rig.focusX;
  const beforeZ = rig.focusZ;
  rig.focusX = dragAxisWithResistance(rig.focusX, d.x, bounds.minX, bounds.maxX);
  rig.focusZ = dragAxisWithResistance(rig.focusZ, d.z, bounds.minZ, bounds.maxZ);

  const dt = timeMs - rig.lastPanTime;
  if (Number.isFinite(rig.lastPanTime) && dt > 0) {
    let vx = ((rig.focusX - beforeX) / dt) * MS_PER_SECOND;
    let vz = ((rig.focusZ - beforeZ) / dt) * MS_PER_SECOND;
    const speed = Math.hypot(vx, vz);
    if (speed > CAMERA_PAN_MAX_RELEASE_SPEED) {
      const k = CAMERA_PAN_MAX_RELEASE_SPEED / speed;
      vx *= k;
      vz *= k;
    }
    rig.velocityX = vx;
    rig.velocityZ = vz;
  } else if (Number.isFinite(rig.lastPanTime)) {
    // dt ≤ 0 within the same drag: keep the previous velocity.
    rig.velocityX = previousVelocityX;
    rig.velocityZ = previousVelocityZ;
  }
  rig.lastPanTime = timeMs;
}

/** Ends a drag. Returns true when a COAST (release ease-out or return into bounds) was started. */
export function endPan(rig: CameraRigState, timeMs: number | null, bounds: CameraPanBounds, reducedMotion: boolean): boolean {
  if (
    timeMs === null ||
    !Number.isFinite(rig.lastPanTime) ||
    timeMs - rig.lastPanTime > CAMERA_PAN_RELEASE_IDLE_MS ||
    reducedMotion
  ) {
    rig.velocityX = 0;
    rig.velocityZ = 0;
  }
  if (rig.focusX < bounds.minX || rig.focusX > bounds.maxX) rig.velocityX = 0;
  if (rig.focusZ < bounds.minZ || rig.focusZ > bounds.maxZ) rig.velocityZ = 0;
  rig.lastPanTime = Number.NaN;
  if (reducedMotion) {
    // Invariant F: no ease-out, an instant cut back into bounds.
    rig.focusX = Math.min(bounds.maxX, Math.max(bounds.minX, rig.focusX));
    rig.focusZ = Math.min(bounds.maxZ, Math.max(bounds.minZ, rig.focusZ));
    rig.phase = "MANUAL";
    return false;
  }
  if (rig.velocityX !== 0 || rig.velocityZ !== 0 || !isInsidePanBounds(rig.focusX, rig.focusZ, bounds)) {
    rig.phase = "COAST";
    return true;
  }
  rig.phase = "MANUAL";
  return false;
}

/** Integrates one axis of a coast into scratchAxis (closed-form, exact at any frame rate). */
function stepAxis(value: number, velocity: number, min: number, max: number, decay: number): void {
  if (value < min || value > max) {
    const bound = value < min ? min : max;
    let v = bound + (value - bound) * decay;
    if (Math.abs(v - bound) <= CAMERA_PAN_REST_EPSILON) v = bound;
    scratchAxis.value = v;
    scratchAxis.velocity = 0;
    return;
  }
  let v = value + velocity * (CAMERA_PAN_EASE_TIME_CONSTANT_MS / MS_PER_SECOND) * (1 - decay);
  let nextVelocity = velocity * decay;
  if (v > max) {
    v = max;
    nextVelocity = 0;
  } else if (v < min) {
    v = min;
    nextVelocity = 0;
  }
  if (Math.abs(nextVelocity) < CAMERA_PAN_STOP_SPEED) nextVelocity = 0;
  scratchAxis.value = v;
  scratchAxis.velocity = nextVelocity;
}

/** Advances a COAST by dtMs. Returns true while the camera is still moving. */
export function stepCameraRig(rig: CameraRigState, dtMs: number, bounds: CameraPanBounds): boolean {
  if (rig.phase !== "COAST" || !Number.isFinite(dtMs) || dtMs <= 0) return rig.phase === "COAST";
  const decay = Math.exp(-dtMs / CAMERA_PAN_EASE_TIME_CONSTANT_MS);
  stepAxis(rig.focusX, rig.velocityX, bounds.minX, bounds.maxX, decay);
  rig.focusX = scratchAxis.value;
  rig.velocityX = scratchAxis.velocity;
  stepAxis(rig.focusZ, rig.velocityZ, bounds.minZ, bounds.maxZ, decay);
  rig.focusZ = scratchAxis.value;
  rig.velocityZ = scratchAxis.velocity;
  const moving = rig.velocityX !== 0 || rig.velocityZ !== 0 || !isInsidePanBounds(rig.focusX, rig.focusZ, bounds);
  if (!moving) rig.phase = "MANUAL";
  return moving;
}

/** Yaw after a two-finger twist. Not normalised. */
export function getYawAfterTwist(yawRad: number, twistDeltaRad: number): number {
  return yawRad + twistDeltaRad;
}

export function twistCameraRig(rig: CameraRigState, twistDeltaRad: number): void {
  if (!Number.isFinite(twistDeltaRad)) return;
  takeManualControl(rig);
  rig.yawRad = getYawAfterTwist(rig.yawRad, twistDeltaRad);
}

export function getCameraRigPose(target: { x: number; y: number; z: number }, yawRad: number): CameraRigPose {
  return { focusX: target.x, focusY: target.y, focusZ: target.z, yawRad };
}

/** A fly-to keeps the user's rotation and never cancels a rotation in progress. */
export function getFlightYaw(rig: CameraRigState): number {
  return rig.phase === "FLIGHT" ? rig.targetYawRad : rig.yawRad;
}

/** Destination of one rotate-button step; builds on the running flight's destination, so taps accumulate. */
export function getRotateStepPose(rig: CameraRigState, deltaRad: number): CameraRigPose {
  return rig.phase === "FLIGHT"
    ? { focusX: rig.targetFocusX, focusY: rig.targetFocusY, focusZ: rig.targetFocusZ, yawRad: rig.targetYawRad + deltaRad }
    : { focusX: rig.focusX, focusY: rig.focusY, focusZ: rig.focusZ, yawRad: rig.yawRad + deltaRad };
}

export function beginRigFlight(rig: CameraRigState, to: CameraRigPose): void {
  rig.phase = "FLIGHT";
  rig.targetFocusX = to.focusX;
  rig.targetFocusY = to.focusY;
  rig.targetFocusZ = to.focusZ;
  rig.targetYawRad = to.yawRad;
  rig.velocityX = 0;
  rig.velocityZ = 0;
  rig.lastPanTime = Number.NaN;
  rig.stopFlightRequested = false;
}

export function copyPoseIntoRig(rig: CameraRigState, focusX: number, focusY: number, focusZ: number, yawRad: number): void {
  rig.focusX = focusX;
  rig.focusY = focusY;
  rig.focusZ = focusZ;
  rig.yawRad = yawRad;
}

/** Places the camera at focus + rotated offset, looking at the focus (numeric lookAt overload: no allocation). */
export function applyCameraRigPose(rig: CameraRigState, camera: CameraPoseTarget): void {
  const o = getRotatedCameraOffsetInto(rig.yawRad, scratchOffset);
  camera.position.set(rig.focusX + o.x, rig.focusY + o.y, rig.focusZ + o.z);
  camera.lookAt(rig.focusX, rig.focusY, rig.focusZ);
  camera.updateMatrixWorld();
}
