import {
  locateOnLane,
  splineProgressToPoseInto,
  type RiverLane,
  type SplinePathCoord,
  type SplinePoseOut,
} from "./SplinePathCoord";
import { currentProgress } from "./splineProgress";
import { stretchIndexAt, type EndlessRiverFrame } from "./endlessRiverFrame";
import type { WorldXZ } from "./types";

/*
 * MFW-58: lane poses on the endless river (3D). A krathong of stretch s is the lane pose of its stored SplinePathCoord translated
 * by s·T. The stretch index comes from the zone↔stretch mapping at render time; nothing here is persisted (invariants A, B).
 */

/** Where a world point lies on the endless lane. Render-time only, never persisted. lateralOffset is not clamped. */
export interface EndlessLaneLocation {
  readonly stretchIndex: number;
  readonly progress: number;
  readonly lateralOffset: number;
}

/** splineProgressToPoseInto, then x += s·Tx, z += s·Tz; yaw and y unchanged. Allocation-free; s must be a safe integer. */
export function endlessProgressToPoseInto(
  lane: RiverLane,
  frame: EndlessRiverFrame,
  stretchIndex: number,
  progress: number,
  lateralOffset: number,
  out: SplinePoseOut,
): SplinePoseOut {
  if (!Number.isSafeInteger(stretchIndex)) throw new RangeError("stretch index must be a safe integer");
  splineProgressToPoseInto(lane, progress, lateralOffset, out);
  out.x += stretchIndex * frame.periodX;
  out.z += stretchIndex * frame.periodZ;
  return out;
}

/** Same laneId check and CurrentProgress(t) as splineCoordToPoseInto, plus the stretch offset. Allocation-free. */
export function endlessCoordToPoseInto(
  coord: SplinePathCoord,
  lane: RiverLane,
  frame: EndlessRiverFrame,
  stretchIndex: number,
  createdAtMs: number,
  nowMs: number,
  out: SplinePoseOut,
): SplinePoseOut {
  if (coord.laneId !== lane.laneId) throw new RangeError("coord.laneId does not match lane");
  return endlessProgressToPoseInto(
    lane,
    frame,
    stretchIndex,
    currentProgress(coord, createdAtMs, nowMs),
    coord.lateralOffset,
    out,
  );
}

const PROGRESS_CLAMP_EPSILON = 1e-12;

/**
 * Inverse of endlessProgressToPoseInto: tries the stretches s0 − 1, s0, s0 + 1 (s0 = stretchIndexAt(point)) with locateOnLane on
 * point − s·T. Prefers a candidate whose progress is not clamped to 0 or 1; among those the smallest |lateralOffset|, then the lower
 * s. If every candidate is clamped, the smallest world distance to its lane pose wins. Not per frame (it allocates).
 */
export function locateOnEndlessLane(lane: RiverLane, frame: EndlessRiverFrame, point: WorldXZ): EndlessLaneLocation {
  const s0 = stretchIndexAt(frame, point.x, point.z);
  let best: EndlessLaneLocation | null = null;
  let bestClamped: EndlessLaneLocation | null = null;
  let bestDistance = Infinity;
  const pose = { x: 0, y: 0, z: 0, yawRad: 0 };
  for (let s = s0 - 1; s <= s0 + 1; s++) {
    const local = { x: point.x - s * frame.periodX, z: point.z - s * frame.periodZ };
    const loc = locateOnLane(lane, local);
    const candidate: EndlessLaneLocation = { stretchIndex: s, progress: loc.progress, lateralOffset: loc.lateralOffset };
    const clamped = loc.progress <= PROGRESS_CLAMP_EPSILON || loc.progress >= 1 - PROGRESS_CLAMP_EPSILON;
    if (!clamped) {
      if (best === null || Math.abs(candidate.lateralOffset) < Math.abs(best.lateralOffset)) best = candidate;
      continue;
    }
    splineProgressToPoseInto(lane, loc.progress, 0, pose);
    const d = Math.hypot(local.x - pose.x, local.z - pose.z);
    if (d < bestDistance) {
      bestDistance = d;
      bestClamped = candidate;
    }
  }
  return best ?? (bestClamped as EndlessLaneLocation);
}
