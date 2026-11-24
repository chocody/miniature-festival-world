import type { EulerOrder } from "three";
import {
  createSplinePoseOut,
  currentProgress,
  isValidRiverPlacement,
  parsePersistableCoord,
  splineCoordToPoseInto,
  splineProgressToWorld,
  type RiverLane,
  type RiverLaneSet,
  type RiverPlacementSource,
  type SplinePathCoord,
  type SplinePoseOut,
  type WorldVec3,
} from "@/core/coordinates";
import { bobbingPhaseFromId, createBobbingOut, writeBobbingAt, type BobbingOut } from "./bobbing";

/** Yaw (flow direction) about world Y first, then pitch/roll about the yawed local axes. */
export const RIVER_ITEM_EULER_ORDER: EulerOrder = "YXZ";

/** Find My Krathong query result. Derived at call time, NEVER persisted. No bobbing. */
export interface RiverItemPosition {
  readonly laneId: number;
  readonly progress: number; // currentProgress(coord, createdAtMs, nowMs), in [0, 1)
  readonly world: WorldVec3; // lane centreline + lateral offset; usable as a camera fly-to target
  readonly yawRad: number;
}

/** Current position of one stored krathong, or null if it cannot be placed. Call on tap/commit only, never per frame. */
export function getRiverItemPositionAt(
  item: RiverPlacementSource,
  lanes: RiverLaneSet,
  nowMs: number,
): RiverItemPosition | null {
  if (!isValidRiverPlacement(item)) return null;
  const lane = lanes.get(item.coord.laneId);
  if (!lane) return null;
  const progress = currentProgress(item.coord, item.createdAtMs, nowMs);
  const placement = splineProgressToWorld(lane, progress, item.coord.lateralOffset);
  return { laneId: lane.laneId, progress, world: placement.position, yawRad: placement.yawRad };
}

export interface RiverRenderSource extends RiverPlacementSource {
  readonly id: string;
}

export interface PreparedRiverItem<T extends RiverRenderSource = RiverRenderSource> {
  readonly id: string;
  readonly coord: SplinePathCoord; // the validator's fresh copy, never the caller's object
  readonly createdAtMs: number;
  readonly lane: RiverLane;
  readonly bobPhaseRad: number; // bobbingPhaseFromId(id)
  readonly source: T;
}

/** Validates and resolves items once (not per frame). Invalid, duplicate-id or unknown-lane items are skipped silently. */
export function prepareRiverItems<T extends RiverRenderSource>(
  items: readonly T[],
  lanes: RiverLaneSet,
): readonly PreparedRiverItem<T>[] {
  const seen = new Set<string>();
  const prepared: PreparedRiverItem<T>[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    if (typeof item.id !== "string" || item.id === "" || seen.has(item.id)) continue;
    if (!isValidRiverPlacement(item)) continue;
    const parsed = parsePersistableCoord(item.coord);
    if (!parsed.ok || parsed.coord.mode !== "SPLINE_PATH") continue;
    const lane = lanes.get(parsed.coord.laneId);
    if (!lane) continue;
    seen.add(item.id);
    prepared.push(
      Object.freeze({
        id: item.id,
        coord: parsed.coord,
        createdAtMs: item.createdAtMs,
        lane,
        bobPhaseRad: bobbingPhaseFromId(item.id),
        source: item,
      }),
    );
  }
  return Object.freeze(prepared);
}

/** Structural subset of three's Object3D that the per-frame transform writes. */
export interface RiverTransformTarget {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly rotation: { set(x: number, y: number, z: number, order?: EulerOrder): unknown };
}

export interface RiverFrameScratch {
  readonly pose: SplinePoseOut;
  readonly bob: BobbingOut;
}

export function createRiverFrameScratch(): RiverFrameScratch {
  return { pose: createSplinePoseOut(), bob: createBobbingOut() };
}

/** Per-frame, allocation-free: the item's pose at nowMs (+ bobbing unless reducedMotion) into target. */
export function applyRiverItemTransform(
  target: RiverTransformTarget,
  item: PreparedRiverItem,
  nowMs: number,
  reducedMotion: boolean,
  scratch: RiverFrameScratch,
): void {
  const pose = splineCoordToPoseInto(item.coord, item.lane, item.createdAtMs, nowMs, scratch.pose);
  const bob = writeBobbingAt(nowMs, item.bobPhaseRad, reducedMotion, scratch.bob);
  target.position.set(pose.x, pose.y + bob.offsetY, pose.z);
  target.rotation.set(bob.pitchRad, pose.yawRad, bob.rollRad, RIVER_ITEM_EULER_ORDER);
}
