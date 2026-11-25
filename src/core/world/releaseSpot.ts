import type { FestivalEventId } from "@/config/events/types";
import type { RiverLane, RiverLaneSet, RiverPlacementSource } from "@/core/coordinates";
import { wrap01 } from "@/core/math/wrap01";
import type { PublicCreation } from "@/services/api/creationTypes";
import { findNearestFreeSpot, isSpotFree, riverSpotLateralLimit, type RiverSpot } from "./riverCollision";
import { getLoyKrathongRiverLanes } from "./riverLanes";
import { publicCreationsToRiverItems } from "./zoneRiverItems";

export interface ReleaseLanding {
  readonly landing: RiverSpot;
  readonly collided: boolean;
}

/** progress wrapped to [0, 1), lateral clamped to ±riverSpotLateralLimit(lane). */
export function clampSpotToLane(spot: RiverSpot, lane: RiverLane): RiverSpot {
  const lim = riverSpotLateralLimit(lane);
  return {
    laneId: spot.laneId,
    progress: wrap01(spot.progress),
    lateralOffset: Math.min(lim, Math.max(-lim, spot.lateralOffset)),
  };
}

/** Client pre-check at release (owner decision 25). Never per frame. */
export function resolveReleaseLanding(
  candidate: RiverSpot,
  existing: readonly RiverPlacementSource[],
  lanes: RiverLaneSet,
  nowMs: number,
): ReleaseLanding {
  const lane = lanes.get(candidate.laneId);
  if (!lane) return { landing: candidate, collided: false };
  const clamped = clampSpotToLane(candidate, lane);
  const free = findNearestFreeSpot(clamped, existing, lanes, nowMs);
  if (free === null) return { landing: clamped, collided: false }; // lane full: the server opens the next zone
  return { landing: free, collided: !isSpotFree(clamped, existing, lanes, nowMs) };
}

/** The orchestrator's entry point: visible zone items → river sources, Loy Krathong lanes. zone null → no existing items. */
export function resolveReleaseLandingForZone(
  candidate: RiverSpot,
  zoneItems: readonly PublicCreation[],
  zone: { readonly eventId: FestivalEventId; readonly zoneId: number } | null,
  nowMs: number,
): ReleaseLanding {
  const existing = zone === null ? [] : publicCreationsToRiverItems(zoneItems, zone);
  return resolveReleaseLanding(candidate, existing, getLoyKrathongRiverLanes(), nowMs);
}
