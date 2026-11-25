import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_PIER_RELEASE_SPOT, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_MIN_CENTER_SPACING } from "@/config/riverFlow.config";
import { DEFAULT_KRATHONG_APPEARANCE, serializeKrathongAppearance } from "@/core/customization";
import type { PublicCreation } from "@/services/api/creationTypes";
import { getLoyKrathongRiverLanes } from "./riverLanes";
import { isSpotFree, riverCoordFromSpot, riverSpotDistance, riverSpotLateralLimit } from "./riverCollision";
import { resolveReleaseLanding, resolveReleaseLandingForZone } from "./releaseSpot";

const NOW = 1_700_000_000_000;
const lanes = getLoyKrathongRiverLanes();
const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
const CANDIDATE = LOY_KRATHONG_PIER_RELEASE_SPOT;
const itemAt = (spot: typeof CANDIDATE, id = "a") => ({ id, coord: riverCoordFromSpot(spot, NOW), createdAtMs: NOW });

describe("resolveReleaseLanding", () => {
  it("keeps a free candidate", () => {
    expect(resolveReleaseLanding(CANDIDATE, [], lanes, NOW)).toEqual({ landing: CANDIDATE, collided: false });
  });

  it("moves a candidate that sits on another krathong to a free spot", () => {
    const first = resolveReleaseLanding(CANDIDATE, [itemAt(CANDIDATE)], lanes, NOW);
    expect(first.collided).toBe(true);
    expect(isSpotFree(first.landing, [itemAt(CANDIDATE)], lanes, NOW)).toBe(true);
    expect(riverSpotDistance(first.landing, CANDIDATE, lane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING - 1e-9);
    expect(resolveReleaseLanding(CANDIDATE, [itemAt(CANDIDATE)], lanes, NOW)).toEqual(first);
  });

  it("clamps the lateral offset without calling it a collision", () => {
    const r = resolveReleaseLanding({ ...CANDIDATE, lateralOffset: 0.45 }, [], lanes, NOW);
    expect(r.landing.lateralOffset).toBeLessThanOrEqual(riverSpotLateralLimit(lane));
    expect(r.collided).toBe(false);
  });
});

describe("resolveReleaseLandingForZone", () => {
  const creation = (zoneId: number): PublicCreation => ({
    id: "00000000-0000-4000-8000-000000000001",
    eventId: "loy_krathong",
    zoneId,
    appearance: serializeKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE) as unknown as PublicCreation["appearance"],
    coord: riverCoordFromSpot(CANDIDATE, NOW),
    publicWishText: null,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: "2099-01-01T00:00:00.000Z",
    displayName: null,
  });
  it("uses the visible zone's items only", () => {
    const zone = { eventId: "loy_krathong" as const, zoneId: 1 };
    expect(resolveReleaseLandingForZone(CANDIDATE, [creation(1)], zone, NOW).collided).toBe(true);
    expect(resolveReleaseLandingForZone(CANDIDATE, [creation(1)], null, NOW).collided).toBe(false);
    expect(resolveReleaseLandingForZone(CANDIDATE, [creation(2)], zone, NOW).collided).toBe(false);
  });
});
