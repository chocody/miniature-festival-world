import { LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createRiverLaneSet, type RiverLaneSet } from "@/core/coordinates";

let loyKrathongLanes: RiverLaneSet | null = null;

/**
 * The ONE lane set of the Loy Krathong river, shared by 3D flow, 2D fallback, Find My, the release ritual and the server
 * collision re-check (invariant B). Built on first call, then the same object every call.
 */
export function getLoyKrathongRiverLanes(): RiverLaneSet {
  if (loyKrathongLanes === null) loyKrathongLanes = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
  return loyKrathongLanes;
}
