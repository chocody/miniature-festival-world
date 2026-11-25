// @vitest-environment node
import { CatmullRomCurve3 } from "three";
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import {
  createRiverLane,
  createRiverLaneSet,
  createSplinePoseOut,
  SPLINE_CURVE_TYPE,
  splineCoordToPoseInto,
  splineProgressToPoseInto,
  splineProgressToWorld,
  type RiverLaneDefinition,
  type SplinePathCoord,
} from "@/core/coordinates";
import {
  LATERAL_SAMPLES,
  LOOP_LANE_DEF,
  PROGRESS_SAMPLES,
  STRAIGHT_LANE_DEF,
  S_LANE_DEF,
} from "@/core/coordinates/__fixtures__/riverLanes";
import {
  CURVE_ARC_LENGTH_DIVISIONS,
  createFlatLane,
  createFlatLaneFrameOut,
  createFlatLaneSet,
  createFlatPoseOut,
  flatCoordToPoseInto,
  flatLaneFrameInto,
  flatLanePointAt,
  flatProgressToPoseInto,
} from "./flatLane";

const DEFS: readonly RiverLaneDefinition[] = [STRAIGHT_LANE_DEF, S_LANE_DEF, LOOP_LANE_DEF, LOY_KRATHONG_RIVER_LANES[0]];
const SAMPLE_COUNT = 2000;

describe("flat lane twin (three-free) vs three", () => {
  it("pins the three internals the twin mirrors", () => {
    expect(CURVE_ARC_LENGTH_DIVISIONS).toBe(new CatmullRomCurve3().arcLengthDivisions);
    expect(SPLINE_CURVE_TYPE).toBe("centripetal");
  });

  it.each(DEFS.map((d, i) => [i, d] as const))("lane %i: arc lengths and points are bit-identical", (_i, def) => {
    const flat = createFlatLane(def);
    const ref = createRiverLane(def);
    expect([...flat.arcLengths]).toEqual(ref.curve.getLengths());
    const out = { x: 0, y: 0, z: 0 };
    for (let k = 0; k <= SAMPLE_COUNT; k++) {
      const u = k / SAMPLE_COUNT;
      const expected = ref.curve.getPointAt(u);
      flatLanePointAt(flat, u, out);
      expect(out.x).toBe(expected.x);
      expect(out.y).toBe(expected.y);
      expect(out.z).toBe(expected.z);
    }
  });

  it.each(DEFS.map((d, i) => [i, d] as const))("lane %i: poses are bit-identical (wrap, clamp)", (_i, def) => {
    const flat = createFlatLane(def);
    const ref = createRiverLane(def);
    const a = createFlatPoseOut();
    const b = createSplinePoseOut();
    const progresses = [...PROGRESS_SAMPLES, -0.25, 1.25, ...Array.from({ length: 101 }, (_, k) => k / 100)];
    for (const p of progresses) {
      for (const lat of [...LATERAL_SAMPLES, -0.7, 0.7]) {
        const r = flatProgressToPoseInto(flat, p, lat, a);
        splineProgressToPoseInto(ref, p, lat, b);
        expect(r).toBe(a);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
        expect(a.z).toBe(b.z);
        expect(a.yawRad).toBe(b.yawRad);
      }
    }
  });

  it("coord poses are bit-identical and the laneId is checked", () => {
    const def = LOY_KRATHONG_RIVER_LANES[0];
    const flat = createFlatLane(def);
    const ref = createRiverLane(def);
    const coord: SplinePathCoord = {
      mode: "SPLINE_PATH",
      laneId: def.laneId,
      spawnProgress: 0.37,
      speedFactor: 0.008,
      lateralOffset: -0.2,
    };
    const a = createFlatPoseOut();
    const b = createSplinePoseOut();
    for (const [created, now] of [[0, 0], [1_000, 61_000], [5_000, 1_000], [0, NaN]] as const) {
      flatCoordToPoseInto(coord, flat, created, now, a);
      splineCoordToPoseInto(coord, ref, created, now, b);
      expect(a).toEqual(b);
    }
    const wrong = { ...coord, laneId: def.laneId + 1 };
    expect(() => flatCoordToPoseInto(wrong, flat, 0, 0, a)).toThrow(RangeError);
    expect(() => splineCoordToPoseInto(wrong, ref, 0, 0, b)).toThrow(RangeError);
  });

  it("frames equal splineProgressToWorld and reject progress outside [0, 1]", () => {
    for (const def of DEFS) {
      const flat = createFlatLane(def);
      const ref = createRiverLane(def);
      const f = createFlatLaneFrameOut();
      for (const p of PROGRESS_SAMPLES) {
        const w = splineProgressToWorld(ref, p, 0);
        expect(flatLaneFrameInto(flat, p, f)).toBe(f);
        expect(f.cx).toBe(w.centerline.x);
        expect(f.cz).toBe(w.centerline.z);
        expect(f.rx).toBe(w.right.x);
        expect(f.rz).toBe(w.right.z);
      }
      expect(() => flatLaneFrameInto(flat, 1.5, f)).toThrow(RangeError);
    }
  });

  const base = STRAIGHT_LANE_DEF;
  const pt = (x: number, y = 0, z = 0) => ({ x, y, z });
  const INVALID: readonly [string, RiverLaneDefinition][] = [
    ["laneId -1", { ...base, laneId: -1 }],
    ["laneId 1.5", { ...base, laneId: 1.5 }],
    ["width 0", { ...base, width: 0 }],
    ["width NaN", { ...base, width: NaN }],
    ["one point", { ...base, controlPoints: [pt(0)] }],
    ["closed with 2 points", { ...base, closed: true, controlPoints: [pt(0), pt(1)] }],
    ["NaN coordinate", { ...base, controlPoints: [pt(0), pt(NaN)] }],
    ["repeated point", { ...base, controlPoints: [pt(0), pt(0), pt(1)] }],
    ["closed last = first", { ...base, closed: true, controlPoints: [pt(0), pt(1), pt(2, 0, 1), pt(0)] }],
  ];
  it.each(INVALID)("validation parity: %s", (_name, def) => {
    let expected = "";
    try {
      createRiverLane(def);
    } catch (e) {
      expect(e).toBeInstanceOf(RangeError);
      expected = (e as Error).message;
    }
    expect(expected).not.toBe("");
    expect(() => createFlatLane(def)).toThrow(new RangeError(expected));
  });

  it("lane set parity: empty and duplicate ids", () => {
    expect(() => createFlatLaneSet([])).toThrow(new RangeError("at least one lane definition is required"));
    expect(() => createRiverLaneSet([])).toThrow(new RangeError("at least one lane definition is required"));
    expect(() => createFlatLaneSet([base, base])).toThrow(new RangeError(`duplicate laneId: ${base.laneId}`));
    const set = createFlatLaneSet([base, S_LANE_DEF]);
    expect(set.get(S_LANE_DEF.laneId)?.laneId).toBe(S_LANE_DEF.laneId);
    expect(set.get(999)).toBeUndefined();
    expect(Object.isFrozen(set)).toBe(true);
  });
});
