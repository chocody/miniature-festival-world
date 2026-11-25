import {
  type RiverLane,
  type RiverLaneSet,
  type RiverPlacementSource,
  type SplineLaneLocation,
  type SplinePathCoord,
  type SplinePoseOut,
  isValidRiverPlacement,
  locateOnLane,
  splineCoordToPoseInto,
  splineCoordToWorld,
} from "@/core/coordinates";
import {
  type BoundsXZ,
  type CanvasPoint,
  type CanvasPointOut,
  type CanvasViewport,
  type TopDownProjection,
  canvasToWorldXZ,
  createTopDownProjection,
  worldToCanvas,
  worldToCanvasInto,
} from "./topDownProjection";

export * from "./topDownProjection";

export const BOUNDS_SAMPLES = 256;

/** Bounds of all lanes' centerlines in world xz, expanded by half the lane width on each side. */
export function computeLaneBoundsXZ(lanes: readonly RiverLane[], samples: number = BOUNDS_SAMPLES): BoundsXZ {
  if (lanes.length === 0) throw new RangeError("at least one lane is required");
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const lane of lanes) {
    const half = lane.width / 2;
    for (let i = 0; i <= samples; i++) {
      const p = lane.curve.getPointAt(i / samples);
      minX = Math.min(minX, p.x - half);
      maxX = Math.max(maxX, p.x + half);
      minZ = Math.min(minZ, p.z - half);
      maxZ = Math.max(maxZ, p.z + half);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/** Invariant B: the same coord and the same lane curve feed both 3D and 2D. */
export function splineCoordToCanvas(
  coord: SplinePathCoord,
  lane: RiverLane,
  createdAtMs: number,
  nowMs: number,
  projection: TopDownProjection,
): CanvasPoint {
  return worldToCanvas(splineCoordToWorld(coord, lane, createdAtMs, nowMs).position, projection);
}

export function canvasToSplineLocation(
  point: CanvasPoint,
  lane: RiverLane,
  projection: TopDownProjection,
): SplineLaneLocation {
  return locateOnLane(lane, canvasToWorldXZ(point, projection));
}

/** Allocation-free twin of splineCoordToCanvas; bit-identical. `scratchPose` is caller-owned. */
export function splineCoordToCanvasInto(
  coord: SplinePathCoord,
  lane: RiverLane,
  createdAtMs: number,
  nowMs: number,
  projection: TopDownProjection,
  out: CanvasPointOut,
  scratchPose: SplinePoseOut,
): CanvasPointOut {
  splineCoordToPoseInto(coord, lane, createdAtMs, nowMs, scratchPose);
  return worldToCanvasInto(scratchPose, projection, out);
}

/** 2D projection fitted to a whole lane set. */
export function createLaneSetProjection(lanes: RiverLaneSet, viewport: CanvasViewport): TopDownProjection {
  return createTopDownProjection(computeLaneBoundsXZ(lanes.lanes), viewport);
}

/** 2D twin of getRiverItemPositionAt: null for invalid input or an unknown lane. Not per-frame. */
export function getRiverItemCanvasPositionAt(
  item: RiverPlacementSource,
  lanes: RiverLaneSet,
  nowMs: number,
  projection: TopDownProjection,
): CanvasPoint | null {
  if (!isValidRiverPlacement(item)) return null;
  const lane = lanes.get(item.coord.laneId);
  return lane ? splineCoordToCanvas(item.coord, lane, item.createdAtMs, nowMs, projection) : null;
}
