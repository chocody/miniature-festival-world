import { Object3D, Vector3 } from "three";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import type { WorldXZ } from "@/core/coordinates";

/** The R3F click fields this reads (ThreeEvent<MouseEvent> fits; so does the DOM test stub's synthetic event). */
export interface TapClickLike {
  readonly delta?: unknown; // px between pointerdown and click (R3F)
  readonly point?: unknown; // world-space hit point (R3F)
  readonly object?: unknown; // the hit Object3D (R3F)
}

const scratch = new Vector3();

/** False only when R3F reports that the click ended a drag (delta > DRAG_START_DISTANCE_PX). A missing delta counts as a tap. */
export function isTapClick(event: Pick<TapClickLike, "delta">): boolean {
  return typeof event.delta !== "number" || !(event.delta > DRAG_START_DISTANCE_PX);
}

/**
 * Hit point in the hit object's PARENT space (x, z), for effects rendered as siblings of the hit mesh (the world-view group).
 * Null when not a tap, when the point/object are missing or not three objects, or when the result is not finite.
 * Render-time only — NEVER persisted or sent (invariant A).
 */
export function tapPointInParentSpace(event: TapClickLike): WorldXZ | null {
  if (!isTapClick(event) || !(event.point instanceof Vector3) || !(event.object instanceof Object3D)) return null;
  const frame = event.object.parent ?? event.object;
  frame.updateWorldMatrix(true, false);
  scratch.copy(event.point);
  frame.worldToLocal(scratch);
  return Number.isFinite(scratch.x) && Number.isFinite(scratch.z) ? { x: scratch.x, z: scratch.z } : null;
}
