import { ZONE_ID_MIN } from "@/config/world.config";

/**
 * GrowingWorldScaler: view model of the growing river (spec §6.5 Task 5.3 "เปิดโซนคุ้งน้ำใหม่ (Zone 2, Zone 3, ...) ต่อเนื่องไปตามลำน้ำ").
 * Zone ids increase downstream: Zone 1 is the most upstream bend. Every zone renders the same river bend (one environment,
 * one lane set); zone_id only selects which krathongs are shown. MFW-58 (open question 37): the river is endless and wraps — after
 * the last zone comes Zone 1 again (and before Zone 1 the last), so with two or more zones both neighbours always exist; with one
 * zone there is no neighbour (the same zone repeats along the river).
 */
export interface GrowingWorldView {
  readonly zoneCount: number;
  readonly visibleZoneId: number;
  readonly upstreamZoneId: number | null;
  readonly downstreamZoneId: number | null;
}

function isZoneNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= ZONE_ID_MIN;
}

export function describeGrowingWorld(zoneCount: number | null, visibleZoneId: number | null): GrowingWorldView | null {
  if (visibleZoneId === null) return null;
  if (!isZoneNumber(visibleZoneId) || (zoneCount !== null && !isZoneNumber(zoneCount))) {
    throw new RangeError("invalid zone");
  }
  const count = Math.max(zoneCount ?? ZONE_ID_MIN, visibleZoneId);
  return Object.freeze({
    zoneCount: count,
    visibleZoneId,
    upstreamZoneId: count >= ZONE_ID_MIN + 1 ? (visibleZoneId > ZONE_ID_MIN ? visibleZoneId - 1 : count) : null,
    downstreamZoneId: count >= ZONE_ID_MIN + 1 ? (visibleZoneId < count ? visibleZoneId + 1 : ZONE_ID_MIN) : null,
  });
}
