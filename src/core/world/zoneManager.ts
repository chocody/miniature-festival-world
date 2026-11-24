import { ZONE_ID_MIN, ZONE_ITEM_CAP, type InitialZonePolicy } from "@/config/world.config";

/**
 * Occupancy of one existing zone, as counted by the server write path (MFW-45).
 * MFW-45: itemCount = every stored, non-expired row of the zone INCLUDING hidden/flagged ones (so an un-hidden item can never
 * push a zone above the cap); hasFreeSpot = findNearestFreeSpot(candidate, zoneItems, getLoyKrathongRiverLanes(), nowMs) !== null
 * (src/core/world/riverCollision.ts; owner decision 25). Make read + insert atomic (e.g. a per-event advisory lock in a new SQL function).
 */
export interface ZoneFill {
  readonly zoneId: number;
  readonly itemCount: number;
  readonly hasFreeSpot: boolean;
}

/** A zone is full at the item cap OR when no free spot is left, whichever comes first (owner decisions 4 and 25). */
export function isZoneFull(fill: ZoneFill, cap: number = ZONE_ITEM_CAP): boolean {
  return fill.itemCount >= cap || !fill.hasFreeSpot;
}

/** Backlog 2.4: "first zone of the event below the 80-item cap, else a new zone". Missing ids in [ZONE_ID_MIN, max] count as empty. */
export function assignZoneForNewCreation(fills: readonly ZoneFill[], cap: number = ZONE_ITEM_CAP): number {
  if (!Number.isSafeInteger(cap) || cap < 1) throw new RangeError("cap must be a positive integer");
  const byZone = new Map<number, ZoneFill>();
  for (const fill of fills) {
    if (!Number.isSafeInteger(fill.zoneId) || fill.zoneId < ZONE_ID_MIN) throw new RangeError("invalid zoneId");
    if (!Number.isSafeInteger(fill.itemCount) || fill.itemCount < 0) throw new RangeError("invalid itemCount");
    if (typeof fill.hasFreeSpot !== "boolean") throw new RangeError("invalid hasFreeSpot");
    if (byZone.has(fill.zoneId)) throw new RangeError("duplicate zoneId");
    byZone.set(fill.zoneId, fill);
  }
  if (byZone.size === 0) return ZONE_ID_MIN;
  let max = ZONE_ID_MIN;
  for (const id of byZone.keys()) if (id > max) max = id;
  for (let z = ZONE_ID_MIN; z <= max; z++) {
    const f = byZone.get(z);
    if (f === undefined || !isZoneFull(f, cap)) return z;
  }
  return max + 1;
}

/** Open zones = highest zone id with a visible creation; at least ZONE_ID_MIN. */
export function zoneCountFromHighestZoneId(highestZoneId: number | null): number {
  if (highestZoneId === null) return ZONE_ID_MIN;
  if (!Number.isSafeInteger(highestZoneId) || highestZoneId < ZONE_ID_MIN) throw new RangeError("invalid highestZoneId");
  return highestZoneId;
}

export function isClientZoneId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= ZONE_ID_MIN;
}

export function pickInitialZoneId(zoneCount: number, policy: InitialZonePolicy): number {
  if (!isClientZoneId(zoneCount)) throw new RangeError("invalid zoneCount");
  return policy === "FIRST" ? ZONE_ID_MIN : zoneCount;
}
