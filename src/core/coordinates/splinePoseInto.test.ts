// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createRiverLane,
  createSplinePoseOut,
  splineCoordToPoseInto,
  splineCoordToWorld,
  splineProgressToPoseInto,
  splineProgressToWorld,
  type SplinePathCoord,
} from "./index";
import { LATERAL_SAMPLES, LOOP_LANE_DEF, PROGRESS_SAMPLES, STRAIGHT_LANE_DEF, S_LANE_DEF } from "./__fixtures__/riverLanes";

const lanes = [STRAIGHT_LANE_DEF, S_LANE_DEF, LOOP_LANE_DEF].map(createRiverLane);
const same = (a: number, b: number) => expect(a === b).toBe(true);
const T0 = 1_700_000_000_000;

describe("splineProgressToPoseInto", () => {
  it("is bit-identical to splineProgressToWorld", () => {
    const out = createSplinePoseOut();
    for (const lane of lanes) {
      for (const progress of [...PROGRESS_SAMPLES, 1.25, -0.75]) {
        for (const lateral of LATERAL_SAMPLES) {
          const w = splineProgressToWorld(lane, progress, lateral);
          splineProgressToPoseInto(lane, progress, lateral, out);
          same(out.x, w.position.x);
          same(out.y, w.position.y);
          same(out.z, w.position.z);
          same(out.yawRad, w.yawRad);
        }
      }
    }
  });

  it("returns out and keeps only the last call's values", () => {
    const out = createSplinePoseOut();
    const lane = lanes[1];
    let last = out;
    for (let i = 0; i < 50; i++) last = splineProgressToPoseInto(lane, i / 50, 0.1, out);
    expect(last).toBe(out);
    const w = splineProgressToWorld(lane, 49 / 50, 0.1);
    same(out.x, w.position.x);
    same(out.z, w.position.z);
  });

  it("is not disturbed by interleaved world conversions", () => {
    const out = createSplinePoseOut();
    const first = { ...splineProgressToPoseInto(lanes[0], 0.3, 0.2, out) };
    splineProgressToWorld(lanes[1], 0.7, -0.3);
    const third = splineProgressToPoseInto(lanes[0], 0.3, 0.2, out);
    expect(third).toEqual(first);
  });

  it("rejects non-finite input and clamps lateral", () => {
    const out = createSplinePoseOut();
    expect(() => splineProgressToPoseInto(lanes[0], NaN, 0, out)).toThrow(RangeError);
    expect(() => splineProgressToPoseInto(lanes[0], 0, Infinity, out)).toThrow(RangeError);
    const a = { ...splineProgressToPoseInto(lanes[0], 0.5, 0.7, out) };
    const b = splineProgressToPoseInto(lanes[0], 0.5, 0.5, out);
    expect(a).toEqual(b);
  });
});

describe("splineCoordToPoseInto", () => {
  it("is bit-identical to splineCoordToWorld", () => {
    const out = createSplinePoseOut();
    const lane = lanes[1];
    for (const spawnProgress of [0, 0.37, 0.999]) {
      for (const speedFactor of [0, 0.008]) {
        for (const dt of [0, 12_345, 30 * 24 * 3600 * 1000]) {
          const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: 2, spawnProgress, speedFactor, lateralOffset: 0.2 };
          const w = splineCoordToWorld(coord, lane, T0, T0 + dt);
          splineCoordToPoseInto(coord, lane, T0, T0 + dt, out);
          same(out.x, w.position.x);
          same(out.y, w.position.y);
          same(out.z, w.position.z);
          same(out.yawRad, w.yawRad);
        }
      }
    }
  });

  it("rejects a mismatched laneId", () => {
    const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: 9, spawnProgress: 0, speedFactor: 0, lateralOffset: 0 };
    expect(() => splineCoordToPoseInto(coord, lanes[0], T0, T0, createSplinePoseOut())).toThrow(RangeError);
  });
});
