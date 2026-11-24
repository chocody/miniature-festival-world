import {
  RIVER_COLLISION_RADIUS,
  RIVER_DRIFT_SPEED_FACTOR,
  RIVER_MIN_CENTER_SPACING,
  RIVER_SPOT_SEARCH_STEPS_PER_SPACING,
} from "@/config/riverFlow.config";
import {
  currentProgress,
  isValidRiverPlacement,
  splineCoordFromLocation,
  type RiverLane,
  type RiverLaneSet,
  type RiverPlacementSource,
  type SplinePathCoord,
} from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";

/**
 * Owner decision 25: every krathong drifts at the same speed, so the (arc length, lateral) distance between two krathongs
 * never changes. These pure, deterministic helpers pick a free spot at release time (MFW-23) and re-check it on the
 * server (MFW-45). Never call them per frame.
 */

/** A place on a lane at one instant. Derived; persisted only via riverCoordFromSpot (invariant A). */
export interface RiverSpot {
  readonly laneId: number;
  readonly progress: number; // [0, 1)
  readonly lateralOffset: number; // within ±riverSpotLateralLimit(lane)
}

/** Largest |lateralOffset| that keeps a krathong body inside the lane: max(0, 0.5 − RIVER_COLLISION_RADIUS / width). */
export function riverSpotLateralLimit(lane: RiverLane): number {
  return Math.max(0, 0.5 - RIVER_COLLISION_RADIUS / lane.width);
}

/** The time-invariant (arc length, lateral) distance in world units; assumes a.laneId === b.laneId === lane.laneId. */
export function riverSpotDistance(a: RiverSpot, b: RiverSpot, lane: RiverLane): number {
  const d = Math.abs(a.progress - b.progress) % 1;
  const along = Math.min(d, 1 - d) * lane.curve.getLength();
  const across = (a.lateralOffset - b.lateralOffset) * lane.width;
  return Math.hypot(along, across);
}

/** Spot of a stored item at nowMs; null if invalid (isValidRiverPlacement) or its lane is unknown. */
export function riverSpotOf(item: RiverPlacementSource, lanes: RiverLaneSet, nowMs: number): RiverSpot | null {
  if (!isValidRiverPlacement(item)) return null;
  if (!lanes.get(item.coord.laneId)) return null;
  return {
    laneId: item.coord.laneId,
    progress: currentProgress(item.coord, item.createdAtMs, nowMs),
    lateralOffset: item.coord.lateralOffset,
  };
}

function occupiedSpots(
  existing: readonly RiverPlacementSource[],
  lane: RiverLane,
  lanes: RiverLaneSet,
  nowMs: number,
): RiverSpot[] {
  const spots: RiverSpot[] = [];
  for (const item of existing) {
    const spot = riverSpotOf(item, lanes, nowMs);
    if (spot !== null && spot.laneId === lane.laneId) spots.push(spot);
  }
  return spots;
}

function usableCandidateLane(candidate: RiverSpot, lanes: RiverLaneSet): RiverLane | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  if (!Number.isFinite(candidate.progress) || !Number.isFinite(candidate.lateralOffset)) return null;
  return lanes.get(candidate.laneId) ?? null;
}

function isClear(spot: RiverSpot, occupied: readonly RiverSpot[], lane: RiverLane): boolean {
  return occupied.every((o) => riverSpotDistance(spot, o, lane) >= RIVER_MIN_CENTER_SPACING);
}

/** True iff the candidate is a valid spot and no existing item on its lane is closer than RIVER_MIN_CENTER_SPACING. */
export function isSpotFree(
  candidate: RiverSpot,
  existing: readonly RiverPlacementSource[],
  lanes: RiverLaneSet,
  nowMs: number,
): boolean {
  const lane = usableCandidateLane(candidate, lanes);
  if (lane === null) return false;
  if (Math.abs(candidate.lateralOffset) > riverSpotLateralLimit(lane)) return false;
  const spot: RiverSpot = {
    laneId: lane.laneId,
    progress: wrap01(candidate.progress),
    lateralOffset: candidate.lateralOffset,
  };
  return isClear(spot, occupiedSpots(existing, lane, lanes, nowMs), lane);
}

interface GridOffset {
  readonly s: number;
  readonly j: number;
  readonly d2: number;
}

function compareGridOffsets(a: GridOffset, b: GridOffset): number {
  return a.d2 - b.d2 || Math.abs(a.j) - Math.abs(b.j) || b.s - a.s || b.j - a.j;
}

/** Nearest free spot to the candidate (the candidate itself if free), or null when the lane is full. Deterministic. */
export function findNearestFreeSpot(
  candidate: RiverSpot,
  existing: readonly RiverPlacementSource[],
  lanes: RiverLaneSet,
  nowMs: number,
): RiverSpot | null {
  const lane = usableCandidateLane(candidate, lanes);
  if (lane === null) return null;
  const lim = riverSpotLateralLimit(lane);
  const p0 = wrap01(candidate.progress);
  const l0 = Math.min(lim, Math.max(-lim, candidate.lateralOffset));
  const occupied = occupiedSpots(existing, lane, lanes, nowMs);

  const length = lane.curve.getLength();
  const step = RIVER_MIN_CENTER_SPACING / RIVER_SPOT_SEARCH_STEPS_PER_SPACING;
  const n = Math.max(1, Math.ceil(length / step));
  const latStep = step / lane.width;
  const jMax = Math.floor((2 * lim) / latStep);

  const offsets: GridOffset[] = [];
  for (let i = 0; i < n; i++) {
    const s = i <= n / 2 ? i : i - n;
    for (let j = -jMax; j <= jMax; j++) {
      const l = l0 + j * latStep;
      if (l < -lim || l > lim) continue;
      offsets.push({ s, j, d2: ((s * length) / n) ** 2 + (j * step) ** 2 });
    }
  }
  offsets.sort(compareGridOffsets);

  for (const e of offsets) {
    const spot: RiverSpot = {
      laneId: lane.laneId,
      progress: wrap01(p0 + e.s / n),
      lateralOffset: l0 + e.j * latStep,
    };
    if (isClear(spot, occupied, lane)) return Object.freeze(spot);
  }
  return null;
}

/** The persistable coord for a spot chosen at createdAtMs: spawnProgress = spot.progress, speed = RIVER_DRIFT_SPEED_FACTOR. */
export function riverCoordFromSpot(spot: RiverSpot, createdAtMs: number): SplinePathCoord {
  return splineCoordFromLocation(
    { progress: spot.progress, lateralOffset: spot.lateralOffset },
    spot.laneId,
    RIVER_DRIFT_SPEED_FACTOR,
    createdAtMs,
    createdAtMs,
  );
}
