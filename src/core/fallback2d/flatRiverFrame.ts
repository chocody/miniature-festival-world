import type { SplinePathCoord, SplinePoseOut } from "@/core/coordinates/SplinePathCoord";
import { createFlatPoseOut, flatCoordToPoseInto, flatProgressToPoseInto, type FlatLane } from "./flatLane";
import {
  createTopDownProjection,
  worldToCanvasInto,
  type BoundsXZ,
  type CanvasPointOut,
  type TopDownProjection,
} from "./topDownProjection";

export interface FlatCanvasScratch {
  readonly pose: SplinePoseOut;
}

export function createFlatCanvasScratch(): FlatCanvasScratch {
  return { pose: createFlatPoseOut() };
}

/** Allocation-free 2D twin of splineCoordToCanvasInto (bit-identical). */
export function flatCoordToCanvasInto(
  coord: SplinePathCoord,
  lane: FlatLane,
  createdAtMs: number,
  nowMs: number,
  projection: TopDownProjection,
  out: CanvasPointOut,
  scratch: FlatCanvasScratch,
): CanvasPointOut {
  flatCoordToPoseInto(coord, lane, createdAtMs, nowMs, scratch.pose);
  return worldToCanvasInto(scratch.pose, projection, out);
}

/** Same for a lane location (pier preview). */
export function flatProgressToCanvasInto(
  lane: FlatLane,
  progress: number,
  lateralOffset: number,
  projection: TopDownProjection,
  out: CanvasPointOut,
  scratch: FlatCanvasScratch,
): CanvasPointOut {
  flatProgressToPoseInto(lane, progress, lateralOffset, scratch.pose);
  return worldToCanvasInto(scratch.pose, projection, out);
}

/** Fixed-height map: scale = (heightPx − 2·paddingPx) / spanZ, width = ceil(spanX·scale + 2·paddingPx). */
export function createFlatRiverProjection(bounds: BoundsXZ, heightPx: number, paddingPx: number): TopDownProjection {
  if (!Number.isFinite(heightPx) || !Number.isFinite(paddingPx) || paddingPx < 0 || heightPx <= 2 * paddingPx) {
    throw new RangeError("heightPx must be finite and > 2 × paddingPx");
  }
  const spanZ = bounds.maxZ - bounds.minZ;
  const spanX = bounds.maxX - bounds.minX;
  if (!Number.isFinite(spanX) || !Number.isFinite(spanZ) || spanX <= 0 || spanZ <= 0) {
    throw new RangeError("bounds must have positive span on both axes");
  }
  const scale = (heightPx - 2 * paddingPx) / spanZ;
  const width = Math.ceil(spanX * scale + 2 * paddingPx);
  return createTopDownProjection(bounds, { width, height: heightPx, paddingPx });
}

/** scrollLeft that centres canvas x `targetX`: clamp(targetX − viewportWidth/2, 0, max(0, contentWidth − viewportWidth)); any non-finite input → 0. */
export function flatRiverScrollLeft(targetX: number, viewportWidth: number, contentWidth: number): number {
  if (![targetX, viewportWidth, contentWidth].every(Number.isFinite)) return 0;
  const max = Math.max(0, contentWidth - viewportWidth);
  return Math.min(max, Math.max(0, targetX - viewportWidth / 2));
}

/** scrollLeft that keeps the map point at the old viewport centre centred after the map scale changes by scaleRatio (new / old). Any non-finite input or scaleRatio ≤ 0 → 0. */
export function flatRiverScrollLeftAfterRescale(
  scrollLeft: number,
  oldViewportWidth: number,
  newViewportWidth: number,
  scaleRatio: number,
  paddingPx: number,
  newContentWidth: number,
): number {
  const inputs = [scrollLeft, oldViewportWidth, newViewportWidth, scaleRatio, paddingPx, newContentWidth];
  if (!inputs.every(Number.isFinite) || scaleRatio <= 0) return 0;
  return flatRiverScrollLeft((scrollLeft + oldViewportWidth / 2 - paddingPx) * scaleRatio + paddingPx, newViewportWidth, newContentWidth);
}
