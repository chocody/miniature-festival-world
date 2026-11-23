// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createRiverLane,
  currentProgress,
  isPersistableCoord,
  locateOnLane,
  spawnProgressFromCurrent,
  splineCoordFromLocation,
  splineCoordToWorld,
  splineProgressToWorld,
  type RiverLane,
  type SplinePathCoord,
} from "./index";
import {
  LATERAL_SAMPLES,
  LOOP_LANE_DEF,
  PROGRESS_SAMPLES,
  STRAIGHT_LANE_DEF,
  S_LANE_DEF,
  TOLERANCE,
  circularDistance,
} from "./__fixtures__/riverLanes";

const T0 = 1_700_000_000_000;

describe("currentProgress", () => {
  const c = { spawnProgress: 0.25, speedFactor: 0.008 };

  it("equals spawnProgress at createdAt", () => {
    expect(currentProgress(c, T0, T0)).toBe(0.25);
  });
  it("advances per second", () => {
    expect(currentProgress(c, T0, T0 + 10_000)).toBeCloseTo(0.33, 12);
    expect(currentProgress(c, T0, T0 + 1000)).toBeCloseTo(0.258, 12);
  });
  it("wraps past 1", () => {
    expect(currentProgress({ spawnProgress: 0.9, speedFactor: 0.008 }, T0, T0 + 25_000)).toBeCloseTo(0.1, 12);
  });
  it("stays in [0, 1) after a huge elapsed time", () => {
    const p = currentProgress({ spawnProgress: 0.5, speedFactor: 0.008 }, T0, T0 + 31_536_000_000);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
    expect(p).toBeCloseTo(0.5, 9);
  });
  it("treats negative or non-finite elapsed as zero", () => {
    expect(currentProgress(c, T0, T0 - 5000)).toBe(0.25);
    expect(currentProgress(c, T0, NaN)).toBe(0.25);
    expect(currentProgress(c, T0, Infinity)).toBe(0.25);
  });
  it("speed 0 stays at spawn; spawn 1.0 maps to 0", () => {
    expect(currentProgress({ spawnProgress: 0.4, speedFactor: 0 }, T0, T0 + 999_999)).toBe(0.4);
    expect(currentProgress({ spawnProgress: 1, speedFactor: 0 }, T0, T0)).toBe(0);
  });
  it.each([1e308, 1e300])("stays finite for speedFactor %s and a large elapsed time", (speed) => {
    const p = currentProgress({ spawnProgress: 0.3, speedFactor: speed }, T0, T0 + 31_536_000_000);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBe(0.3);
    const s = spawnProgressFromCurrent(0.3, speed, T0, T0 + 31_536_000_000);
    expect(s).toBe(0.3);
  });
  it("is deterministic and pure", () => {
    const a = currentProgress(c, T0, T0 + 12_345);
    const b = currentProgress(c, T0, T0 + 12_345);
    expect(Object.is(a, b)).toBe(true);
  });
});

describe("spawnProgressFromCurrent", () => {
  it.each([
    [0.1, 0.008, 3000],
    [0.9, 0.02, 12_345],
    [0, 0.5, 777_777],
  ])("round trips with currentProgress (spawn %s, speed %s, %s ms)", (spawn, speed, dt) => {
    const cur = currentProgress({ spawnProgress: spawn, speedFactor: speed }, T0, T0 + dt);
    const back = spawnProgressFromCurrent(cur, speed, T0, T0 + dt);
    expect(circularDistance(back, spawn)).toBeLessThanOrEqual(1e-12);
  });
});

describe("createRiverLane", () => {
  const p = (x: number, y = 0, z = 0) => ({ x, y, z });
  it.each([
    ["1 point", { laneId: 1, controlPoints: [p(0)], width: 5 }],
    ["closed with 2 points", { laneId: 1, controlPoints: [p(0), p(1)], width: 5, closed: true }],
    ["width 0", { laneId: 1, controlPoints: [p(0), p(1)], width: 0 }],
    ["width NaN", { laneId: 1, controlPoints: [p(0), p(1)], width: NaN }],
    ["laneId 1.5", { laneId: 1.5, controlPoints: [p(0), p(1)], width: 5 }],
    ["laneId -1", { laneId: -1, controlPoints: [p(0), p(1)], width: 5 }],
    ["NaN coordinate", { laneId: 1, controlPoints: [p(0), p(NaN)], width: 5 }],
    ["duplicate consecutive points", { laneId: 1, controlPoints: [p(0), p(0), p(1)], width: 5 }],
  ])("throws RangeError for %s", (_name, def) => {
    expect(() => createRiverLane(def)).toThrow(RangeError);
  });
});

const LANES: [string, RiverLane][] = [
  ["straight", createRiverLane(STRAIGHT_LANE_DEF)],
  ["S", createRiverLane(S_LANE_DEF)],
  ["loop", createRiverLane(LOOP_LANE_DEF)],
];

describe("splineProgressToWorld on the straight lane", () => {
  const lane = LANES[0][1];
  const tol = TOLERANCE.analyticWorldUnits;

  it("matches the analytic values", () => {
    const w = splineProgressToWorld(lane, 0.25, 0.5);
    expect(Math.abs(w.position.x - 25)).toBeLessThan(tol);
    expect(Math.abs(w.position.y)).toBeLessThan(tol);
    expect(Math.abs(w.position.z - 5)).toBeLessThan(tol);
    expect(Math.abs(w.centerline.x - 25)).toBeLessThan(tol);
    expect(Math.abs(w.centerline.z)).toBeLessThan(tol);
    expect(Math.abs(w.tangent.x - 1)).toBeLessThan(tol);
    expect(Math.abs(w.tangent.z)).toBeLessThan(tol);
    expect(Math.abs(w.right.x)).toBeLessThan(tol);
    expect(Math.abs(w.right.z - 1)).toBeLessThan(tol);
    expect(Math.abs(w.yawRad - Math.PI / 2)).toBeLessThan(tol);
  });
  it("negative lateral goes the other side", () => {
    const w = splineProgressToWorld(lane, 0.5, -0.5);
    expect(Math.abs(w.position.x - 50)).toBeLessThan(tol);
    expect(Math.abs(w.position.z + 5)).toBeLessThan(tol);
  });
  it("wraps progress outside [0, 1]", () => {
    const base = splineProgressToWorld(lane, 0.25, 0).position;
    for (const p of [1.25, -0.75]) {
      const w = splineProgressToWorld(lane, p, 0).position;
      expect(Math.abs(w.x - base.x)).toBeLessThan(tol);
      expect(Math.abs(w.z - base.z)).toBeLessThan(tol);
    }
  });
  it("clamps lateral to ±0.5", () => {
    const a = splineProgressToWorld(lane, 0.25, 0.7).position;
    const b = splineProgressToWorld(lane, 0.25, 0.5).position;
    expect(Math.abs(a.z - b.z)).toBeLessThan(tol);
  });
  it("throws RangeError on non-finite input", () => {
    expect(() => splineProgressToWorld(lane, NaN, 0)).toThrow(RangeError);
    expect(() => splineProgressToWorld(lane, 0.5, Infinity)).toThrow(RangeError);
  });
});

describe("loop lane orientation", () => {
  it("+lateral is right of a counter-clockwise flow (toward the center)", () => {
    const w = splineProgressToWorld(LANES[2][1], 0, 0.5);
    expect(Math.abs(w.position.x - 36)).toBeLessThan(TOLERANCE.analyticWorldUnits);
    expect(Math.abs(w.position.z)).toBeLessThan(TOLERANCE.analyticWorldUnits);
    expect(Math.abs(w.tangent.x)).toBeLessThan(TOLERANCE.analyticWorldUnits);
    expect(Math.abs(w.tangent.z - 1)).toBeLessThan(TOLERANCE.analyticWorldUnits);
  });
});

describe.each(LANES)("%s lane: parametric <-> 3D world", (_name, lane) => {
  const cases = PROGRESS_SAMPLES.flatMap((p) => LATERAL_SAMPLES.map((l) => [p, l] as const));

  it.each(cases)("progress %s lateral %s", (progress, lateral) => {
    const w = splineProgressToWorld(lane, progress, lateral);
    expect(w.position.y).toBe(w.centerline.y);
    expect(w.right.y).toBe(0);
    expect(Math.hypot(w.tangent.x, w.tangent.y, w.tangent.z)).toBeCloseTo(1, 12);
    expect(Math.hypot(w.right.x, w.right.y, w.right.z)).toBeCloseTo(1, 12);
    const dx = w.position.x - w.centerline.x;
    const dz = w.position.z - w.centerline.z;
    expect(Math.abs(dx * w.tangent.x + dz * w.tangent.z)).toBeLessThan(TOLERANCE.worldUnits);
    expect(Math.abs(Math.hypot(dx, dz) - Math.abs(lateral) * lane.width)).toBeLessThan(TOLERANCE.worldUnits);

    const loc = locateOnLane(lane, w.position);
    const dp = lane.closed ? circularDistance(loc.progress, progress) : Math.abs(loc.progress - progress);
    expect(dp).toBeLessThanOrEqual(TOLERANCE.progress);
    expect(Math.abs(loc.lateralOffset - lateral)).toBeLessThanOrEqual(TOLERANCE.lateral);
  });
});

describe("splineCoordToWorld / locateOnLane", () => {
  it("throws on mismatched laneId", () => {
    const coord: SplinePathCoord = {
      mode: "SPLINE_PATH",
      laneId: 99,
      spawnProgress: 0,
      speedFactor: 0,
      lateralOffset: 0,
    };
    expect(() => splineCoordToWorld(coord, LANES[0][1], T0, T0)).toThrow(RangeError);
  });

  it("reports unclamped lateral for points off the lane", () => {
    const lane = LANES[0][1];
    const loc = locateOnLane(lane, { x: 50, z: 3 * lane.width });
    expect(Math.abs(loc.lateralOffset)).toBeGreaterThan(0.5);
  });

  it("throws on NaN point", () => {
    expect(() => locateOnLane(LANES[0][1], { x: NaN, z: 0 })).toThrow(RangeError);
  });

  it("splineCoordFromLocation validates its inputs", () => {
    const loc = { progress: 0.5, lateralOffset: 0 };
    expect(() => splineCoordFromLocation(loc, 1.5, 0, T0, T0)).toThrow(RangeError);
    expect(() => splineCoordFromLocation(loc, 1, -1, T0, T0)).toThrow(RangeError);
    expect(() => splineCoordFromLocation(loc, 1, NaN, T0, T0)).toThrow(RangeError);
    expect(() => splineCoordFromLocation(loc, 1, 2, T0, T0)).toThrow(RangeError);
  });

  describe.each(LANES)("full coord round trip on %s lane", (_name, lane) => {
    const nows = [0, 12_345, 30 * 24 * 3600 * 1000];
    for (const spawn of [0, 0.37, 0.999]) {
      for (const speed of [0, 0.008]) {
        for (const lat of LATERAL_SAMPLES) {
          for (const dt of nows) {
            it(`spawn ${spawn} speed ${speed} lat ${lat} dt ${dt}`, () => {
              const coord: SplinePathCoord = {
                mode: "SPLINE_PATH",
                laneId: lane.laneId,
                spawnProgress: spawn,
                speedFactor: speed,
                lateralOffset: lat,
              };
              const world = splineCoordToWorld(coord, lane, T0, T0 + dt);
              const loc = locateOnLane(lane, world.position);
              const back = splineCoordFromLocation(loc, lane.laneId, speed, T0, T0 + dt);
              expect(circularDistance(back.spawnProgress, spawn)).toBeLessThanOrEqual(TOLERANCE.progress);
              expect(Math.abs(back.lateralOffset - lat)).toBeLessThanOrEqual(TOLERANCE.lateral);
              expect(back.mode).toBe("SPLINE_PATH");
              expect(back.laneId).toBe(coord.laneId);
              expect(back.speedFactor).toBe(speed);
              expect(isPersistableCoord(back)).toBe(true);
            });
          }
        }
      }
    }
  });
});
