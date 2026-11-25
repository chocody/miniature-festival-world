// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { createSplinePoseOut } from "@/core/coordinates";
import { findFocusedRiverItem, writeFindMyAnchorPosition } from "./findMyFocus";
import { getLoyKrathongRiverLanes } from "./riverLanes";
import { getRiverItemPositionAt, prepareRiverItems } from "./riverFlow";

const T0 = 1_700_000_000_000;
const lanes = getLoyKrathongRiverLanes();
const item = {
  id: "a",
  coord: {
    mode: "SPLINE_PATH" as const,
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    spawnProgress: 0.25,
    speedFactor: RIVER_DRIFT_SPEED_FACTOR,
    lateralOffset: 0.2,
  },
  createdAtMs: T0,
};
const prepared = prepareRiverItems([item], lanes)[0];
let last: [number, number, number] = [0, 0, 0];
const target = {
  position: {
    set(x: number, y: number, z: number) {
      last = [x, y, z];
    },
  },
};

describe("findMyFocus", () => {
  it("matches getRiverItemPositionAt bit for bit", () => {
    for (const now of [T0, T0 + 10_000, T0 + 100_000, T0 + 200_000]) {
      writeFindMyAnchorPosition(target, prepared, now, createSplinePoseOut());
      const w = getRiverItemPositionAt(prepared, lanes, now)!.world;
      expect(last[0]).toBe(w.x);
      expect(last[1]).toBe(w.y);
      expect(last[2]).toBe(w.z);
    }
  });
  it("follows the drift", () => {
    const scratch = createSplinePoseOut();
    writeFindMyAnchorPosition(target, prepared, T0, scratch);
    const a = last;
    expect(scratch.x).toBe(a[0]);
    writeFindMyAnchorPosition(target, prepared, T0 + 10_000, scratch);
    const b = last;
    expect(scratch.x).toBe(b[0]);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeGreaterThan(0);
  });
  it("findFocusedRiverItem", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(findFocusedRiverItem(items, null)).toBeNull();
    expect(findFocusedRiverItem(items, "zzz")).toBeNull();
    expect(findFocusedRiverItem(items, "b")).toBe(items[1]);
  });
});
