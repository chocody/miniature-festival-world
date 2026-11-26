import { CAMERA_FLIGHT_OFFSET } from "@/config/camera.config";
import { LOY_KRATHONG_RIVER_CHANNEL } from "@/config/events/loyKrathong.river.config";
import { getRotatedCameraOffsetInto, type MutableXYZ } from "@/core/camera/cameraRig";
import { alongOf, createEndlessRiverFrame, type EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";

/*
 * MFW-58 endless river (three-free): the Loy Krathong stretch frame and the per-frame view culling of stretch copies. Render-time
 * only; nothing here is persisted (invariant A).
 */

let loyKrathongFrame: EndlessRiverFrame | null = null;

/** The ONE stretch frame of the Loy Krathong river (from LOY_KRATHONG_RIVER_CHANNEL), read by the 3D scene (invariant B). */
export function getLoyKrathongEndlessRiverFrame(): EndlessRiverFrame {
  if (loyKrathongFrame === null) loyKrathongFrame = createEndlessRiverFrame(LOY_KRATHONG_RIVER_CHANNEL.controlPoints);
  return loyKrathongFrame;
}

/** Along-axis extent of everything a stretch draws, relative to the stretch start (world units). */
export interface StretchAlongExtent {
  readonly min: number;
  readonly max: number;
}

/** Structural subset of a three OrthographicCamera (frustum in view units and the zoom). */
export interface OrthoViewLike {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly zoom: number;
}

const OFFSET_X = Number(CAMERA_FLIGHT_OFFSET[0]);
const OFFSET_Y = Number(CAMERA_FLIGHT_OFFSET[1]);
const OFFSET_Z = Number(CAMERA_FLIGHT_OFFSET[2]);
/** sin / tan of the fixed camera elevation (CAMERA_FLIGHT_OFFSET; the rig only changes the yaw). */
export const CAMERA_ELEVATION_SIN = OFFSET_Y / Math.hypot(OFFSET_X, OFFSET_Y, OFFSET_Z);
export const CAMERA_ELEVATION_TAN = OFFSET_Y / Math.hypot(OFFSET_X, OFFSET_Z);

/**
 * Conservative ground-plane radius of an orthographic view around its focus, valid at any yaw: the view rectangle projects onto
 * the ground as halfW × halfH / sin(elevation); scenery up to `heightSpan` above (or the ground that far below) the focus height
 * shifts by heightSpan / tan(elevation). hypot(halfW, halfH / sin) + heightSpan / tan. Allocation-free.
 */
export function orthoViewGroundRadius(
  view: OrthoViewLike,
  sinElevation: number,
  tanElevation: number,
  heightSpan: number,
): number {
  const zoom = view.zoom > 0 ? view.zoom : 1;
  const halfW = Math.abs(view.right - view.left) / (2 * zoom);
  const halfH = Math.abs(view.top - view.bottom) / (2 * zoom);
  return Math.hypot(halfW, halfH / sinElevation) + Math.max(0, heightSpan) / tanElevation;
}

const scratchOffset: MutableXYZ = { x: 0, y: 0, z: 0 };

/**
 * Yaw-aware half extent ALONG the river axis of what an orthographic view at `yawRad` can show around its focus (≤
 * orthoViewGroundRadius): the view rectangle's ground footprint spans ±halfW along the screen-right direction r and ±halfH / sin along
 * the horizontal view direction f, and scenery up to `heightSpan` above (or ground that far below) the focus shifts by
 * heightSpan / tan along f. halfW·|r·a| + (halfH / sin + heightSpan / tan)·|f·a|. Allocation-free (module scratch).
 */
export function orthoViewAlongHalfExtent(
  view: OrthoViewLike,
  yawRad: number,
  frame: EndlessRiverFrame,
  heightSpan: number,
): number {
  const zoom = view.zoom > 0 ? view.zoom : 1;
  const halfW = Math.abs(view.right - view.left) / (2 * zoom);
  const halfH = Math.abs(view.top - view.bottom) / (2 * zoom);
  const o = getRotatedCameraOffsetInto(yawRad, scratchOffset);
  const h = Math.hypot(o.x, o.z);
  const rDotA = (o.z * frame.axisX - o.x * frame.axisZ) / h; // r = (o.z, −o.x) / h
  const fDotA = (-o.x * frame.axisX - o.z * frame.axisZ) / h; // f = −(o.x, o.z) / h
  return (
    halfW * Math.abs(rDotA) +
    (halfH / CAMERA_ELEVATION_SIN + Math.max(0, heightSpan) / CAMERA_ELEVATION_TAN) * Math.abs(fDotA)
  );
}

/** [s·L + min, s·L + max] ∩ [along(focus) − R, along(focus) + R] ≠ ∅. Allocation-free. */
export function isStretchInView(
  frame: EndlessRiverFrame,
  stretchIndex: number,
  extent: StretchAlongExtent,
  focusX: number,
  focusZ: number,
  viewRadius: number,
): boolean {
  const a = alongOf(frame, focusX, focusZ);
  const start = stretchIndex * frame.length;
  return start + extent.min <= a + viewRadius && start + extent.max >= a - viewRadius;
}
