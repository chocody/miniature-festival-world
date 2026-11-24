// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRiverLaneSet, isValidRiverPlacement, type RiverPlacementSource } from "./index";
import { LOOP_LANE_DEF, STRAIGHT_LANE_DEF, S_LANE_DEF } from "./__fixtures__/riverLanes";

const valid = (): RiverPlacementSource => ({
  coord: { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.2, speedFactor: 0.008, lateralOffset: 0.1 },
  createdAtMs: 1_700_000_000_000,
});

describe("createRiverLaneSet", () => {
  it("looks lanes up by id and is frozen", () => {
    const set = createRiverLaneSet([STRAIGHT_LANE_DEF, S_LANE_DEF, LOOP_LANE_DEF]);
    expect(set.lanes.map((l) => l.laneId)).toEqual([1, 2, 3]);
    expect(set.get(2)?.laneId).toBe(2);
    expect(set.get(99)).toBeUndefined();
    expect(set.get(-1)).toBeUndefined();
    expect(set.get(1.5)).toBeUndefined();
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set.lanes)).toBe(true);
  });

  it("rejects bad definitions", () => {
    expect(() => createRiverLaneSet([])).toThrow(RangeError);
    expect(() => createRiverLaneSet([STRAIGHT_LANE_DEF, STRAIGHT_LANE_DEF])).toThrow(/duplicate laneId: 1/);
    expect(() => createRiverLaneSet([{ ...STRAIGHT_LANE_DEF, width: 0 }])).toThrow(RangeError);
  });
});

describe("isValidRiverPlacement", () => {
  it("accepts a valid item", () => {
    expect(isValidRiverPlacement(valid())).toBe(true);
  });

  it("rejects invalid items", () => {
    const v = valid();
    const bad: unknown[] = [
      { ...v, coord: { ...v.coord, x: 1 } },
      { ...v, coord: { mode: "PLANAR_ZONE", u: 0.1, v: 0.1 } },
      { ...v, coord: { ...v.coord, lateralOffset: 0.7 } },
      { ...v, coord: { ...v.coord, speedFactor: 2 } },
      { ...v, createdAtMs: NaN },
      { ...v, createdAtMs: Infinity },
      null,
    ];
    for (const item of bad) expect(isValidRiverPlacement(item as RiverPlacementSource)).toBe(false);
  });
});
