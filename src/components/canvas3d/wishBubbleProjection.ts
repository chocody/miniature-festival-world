import type { Camera, Object3D, Vector3 } from "three";

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export interface MutablePoint {
  x: number;
  y: number;
}

/** Normalised device coords → viewport pixels (y down). Writes and returns `out`. */
export function ndcToViewportPx(ndcX: number, ndcY: number, rect: ViewportRect, out: MutablePoint): MutablePoint {
  out.x = rect.left + ((ndcX + 1) / 2) * rect.width;
  out.y = rect.top + ((1 - ndcY) / 2) * rect.height;
  return out;
}

/**
 * Viewport pixel of an object's world position raised by `liftWorld` (world y). No allocation: `scratch` and `out` are caller-owned.
 * The object's world matrix is refreshed first, so it is right even before the render of this frame.
 */
export function projectObjectToViewport(
  object: Object3D,
  liftWorld: number,
  camera: Camera,
  rect: ViewportRect,
  scratch: Vector3,
  out: MutablePoint,
): MutablePoint {
  object.updateWorldMatrix(true, false);
  object.getWorldPosition(scratch);
  scratch.y += liftWorld;
  camera.updateMatrixWorld();
  scratch.project(camera);
  return ndcToViewportPx(scratch.x, scratch.y, rect, out);
}

/** Inclusive bounds. */
export function isInsideViewport(p: MutablePoint, rect: ViewportRect): boolean {
  return p.x >= rect.left && p.x <= rect.left + rect.width && p.y >= rect.top && p.y <= rect.top + rect.height;
}

/** True when there is no last position or either axis moved by at least `minMovePx`. */
export function shouldMoveBubble(last: MutablePoint | null, next: MutablePoint, minMovePx: number): boolean {
  return last === null || Math.abs(next.x - last.x) >= minMovePx || Math.abs(next.y - last.y) >= minMovePx;
}
