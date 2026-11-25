// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout";
import { locateOnLane } from "@/core/coordinates";
import { getLoyKrathongRiverLanes, riverSpotLateralLimit } from "@/core/world";
import { LOY_KRATHONG_PIER_RELEASE_SPOT, LOY_KRATHONG_RIVER_LANE_ID } from "./loyKrathong.river.config";

describe("LOY_KRATHONG_PIER_RELEASE_SPOT", () => {
  const lane = getLoyKrathongRiverLanes().get(LOY_KRATHONG_RIVER_LANE_ID)!;
  const loc = locateOnLane(lane, LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint);
  const lim = riverSpotLateralLimit(lane);

  it("equals the located pier release point, clamped to the krathong body limit", () => {
    expect(LOY_KRATHONG_PIER_RELEASE_SPOT.laneId).toBe(LOY_KRATHONG_RIVER_LANE_ID);
    expect(LOY_KRATHONG_PIER_RELEASE_SPOT.progress).toBeCloseTo(loc.progress, 9);
    expect(LOY_KRATHONG_PIER_RELEASE_SPOT.lateralOffset).toBeCloseTo(Math.min(lim, Math.max(-lim, loc.lateralOffset)), 9);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(LOY_KRATHONG_PIER_RELEASE_SPOT)).toBe(true);
  });
});
