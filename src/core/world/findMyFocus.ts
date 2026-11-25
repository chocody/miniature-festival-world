import { splineCoordToPoseInto, type SplinePoseOut } from "@/core/coordinates";
import type { PreparedRiverItem } from "./riverFlow";

/** Structural subset of three's Object3D that the anchor writer needs. */
export interface FindMyAnchorTarget {
  readonly position: { set(x: number, y: number, z: number): unknown };
}

/** The focused item of `items`, or null when `focusedId` is null or not present. Not per frame (useMemo). */
export function findFocusedRiverItem<T extends { readonly id: string }>(items: readonly T[], focusedId: string | null): T | null {
  if (focusedId === null) return null;
  return items.find((it) => it.id === focusedId) ?? null;
}

/**
 * Per frame, allocation-free (MFW-30): the focused krathong's lane position at nowMs (no bobbing) into target.position.
 * Bit-identical to getRiverItemPositionAt(item, lanes, nowMs).world (invariant B). Derived, never persisted (invariant A).
 */
export function writeFindMyAnchorPosition(
  target: FindMyAnchorTarget,
  item: PreparedRiverItem,
  nowMs: number,
  scratch: SplinePoseOut,
): void {
  const pose = splineCoordToPoseInto(item.coord, item.lane, item.createdAtMs, nowMs, scratch);
  target.position.set(pose.x, pose.y, pose.z);
}
