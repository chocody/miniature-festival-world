import { describe, expect, it } from "vitest";
import type { BankProfilePoint } from "./bankProfile";
import { createRiverChannel } from "./riverEnvironment";
import type { RiversidePathDefinition } from "./riversidePaths";
import {
  assertVillagerDefinition,
  createVillagerPoseOut,
  planVillagerInstances,
  prepareVillagers,
  villagerPoseInto,
  type VillagerDefinition,
  type VillagerMotionSpec,
  type VillagerPoseOut,
} from "./villagers";

// Straight channel along +x (arc 20), width 2: side 1 is +z (riversidePaths.test pins it).
const channel = createRiverChannel({
  controlPoints: [
    { x: -10, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
  width: 2,
});
const profile: readonly BankProfilePoint[] = [
  { offset: 0, y: -0.3 },
  { offset: 0.25, y: -0.1 },
  { offset: 3, y: -0.1 },
];
const path: RiversidePathDefinition = { pathId: 1, side: 1, setback: 1, halfWidth: 0.2, fromProgress: 0, toProgress: 1 };
const farPath: RiversidePathDefinition = { ...path, pathId: 2, side: -1 };
const def: VillagerDefinition = {
  villagerId: 1,
  pathId: 1,
  fromProgress: 0.4,
  toProgress: 0.6,
  across: 0,
  phase: 0,
  speed: 0.5,
  watch: { atFraction: 0.5, durationMs: 2000 },
  hat: false,
  scale: 1,
};
const motion: VillagerMotionSpec = { stepLength: 0.1, hopHeight: 0.02, waddleRad: 0.08 };
const FLOW_YAW = Math.PI / 2; // atan2(1, 0): flow along +x

const prep = (d: VillagerDefinition = def, paths: readonly RiversidePathDefinition[] = [path, farPath]) =>
  prepareVillagers([d], paths, channel)[0];
const pose = (t: number, d: VillagerDefinition = def, animated = true): VillagerPoseOut =>
  villagerPoseInto(prep(d), channel, profile, motion, t, animated, createVillagerPoseOut());
const snapshot = (p: VillagerPoseOut) => ({ ...p });

describe("villagers (MFW-50 AC1)", () => {
  it("V1 prepareVillagers: leg length, leg time, stop time and cycle", () => {
    const v = prep();
    expect(v.legLength).toBeCloseTo(4, 9);
    expect(v.legMs).toBeCloseTo(8000, 6);
    expect(v.stopMs).toBe(2000);
    expect(v.cycleMs).toBeCloseTo(20000, 6);
    expect(Object.isFrozen(v)).toBe(true);
  });

  it("V2 t = 0: start of the segment, walking downstream", () => {
    const p = pose(0);
    expect(p.progress).toBeCloseTo(0.4, 12);
    expect(p.x).toBeCloseTo(-2, 9);
    expect(p.z).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(-0.1, 12);
    expect(p.activity).toBe("WALK");
    expect(p.yawRad).toBeCloseTo(FLOW_YAW, 9);
  });

  it("V3 t = 2050: hop and waddle come from the distance walked", () => {
    const p = pose(2050);
    expect(p.progress).toBeCloseTo(0.45125, 12);
    expect(Math.abs(p.hopY - 0.02 * Math.abs(Math.sin(Math.PI * 10.25)))).toBeLessThan(1e-9);
    expect(p.hopY).toBeCloseTo(0.014142, 6);
    expect(Math.abs(p.rollRad - 0.08 * Math.sin(Math.PI * 10.25))).toBeLessThan(1e-9);
  });

  it("V4 the watch stop: standing still at the watch spot", () => {
    // The channel arc (curve.getLength) is 20 within float error, so sample just inside the stop window [4000, 6000).
    const a = pose(4001);
    const b = pose(5999);
    for (const p of [a, b]) {
      expect(p.activity).toBe("WATCH");
      expect(p.progress).toBeCloseTo(0.5, 12);
      expect(p.hopY).toBe(0);
      expect(p.rollRad).toBe(0);
    }
    expect([b.x, b.y, b.z]).toEqual([a.x, a.y, a.z]);
  });

  it("V5 after the stop, then the way back (turned around)", () => {
    const a = pose(8000);
    expect(a.progress).toBeCloseTo(0.55, 12);
    expect(a.activity).toBe("WALK");
    const b = pose(10_001); // just past the half cycle (float-robust)
    expect(b.progress).toBeCloseTo(0.6, 4);
    expect(b.yawRad).toBeCloseTo(FLOW_YAW + Math.PI, 9);
  });

  it("V6 watching (and standing) faces the channel centreline, on both banks", () => {
    for (const d of [def, { ...def, pathId: 2 }]) {
      for (const p of [pose(4500, d), pose(0, d, false)]) {
        const forward = { x: Math.sin(p.yawRad), z: Math.cos(p.yawRad) };
        const toCentre = { x: p.x - p.x, z: 0 - p.z }; // the centreline is z = 0 on this fixture
        expect(forward.x * toCentre.x + forward.z * toCentre.z).toBeGreaterThan(0);
      }
    }
  });

  it("V7 periodic in cycleMs; the phase shifts the cycle", () => {
    for (const t of [0, 1234, 4500, 9999, 15_000]) {
      const a = pose(t);
      const b = pose(t + 20_000);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.z).toBeCloseTo(a.z, 9);
      expect(b.activity).toBe(a.activity);
    }
    const shifted = pose(0, { ...def, phase: 0.25 });
    const later = pose(5000);
    expect(shifted.x).toBeCloseTo(later.x, 9);
    expect(shifted.activity).toBe(later.activity);
  });

  it("V8 not animated (reduced motion, LOW): STAND at the watch spot facing the water, independent of time", () => {
    const a = pose(0, def, false);
    expect(a.activity).toBe("STAND");
    expect(a.progress).toBeCloseTo(0.5, 12);
    expect(a.hopY).toBe(0);
    expect(a.rollRad).toBe(0);
    expect(a.yawRad).toBeCloseTo(FLOW_YAW + Math.PI / 2, 9);
    expect(snapshot(pose(1234, def, false))).toEqual(snapshot(a));
    expect(snapshot(pose(9e12, def, false))).toEqual(snapshot(a));
    expect(pose(0, { ...def, watch: null }, false).progress).toBeCloseTo(0.5, 12); // mid-segment without a watch stop
  });

  it("V9 no hidden state: the same time gives the same pose, into the same out object", () => {
    const v = prep();
    const out = createVillagerPoseOut();
    const first = snapshot(villagerPoseInto(v, channel, profile, motion, 3000, true, out));
    villagerPoseInto(v, channel, profile, motion, 1000, true, out);
    const again = villagerPoseInto(v, channel, profile, motion, 3000, true, out);
    expect(again).toBe(out);
    expect(snapshot(again)).toEqual(first);
  });

  it("V10 invalid definitions and times throw RangeError", () => {
    const bad: Partial<VillagerDefinition>[] = [
      { villagerId: 0 },
      { villagerId: 1.5 },
      { fromProgress: 0.6, toProgress: 0.4 },
      { toProgress: 1.2 },
      { fromProgress: -0.1 },
      { across: 1.5 },
      { phase: 1 },
      { phase: -0.1 },
      { speed: 0 },
      { scale: 0 },
      { speed: Number.NaN },
      { across: Number.POSITIVE_INFINITY },
      { watch: { atFraction: 0, durationMs: 1000 } },
      { watch: { atFraction: 1, durationMs: 1000 } },
      { watch: { atFraction: 0.5, durationMs: 0 } },
    ];
    for (const b of bad) expect(() => assertVillagerDefinition({ ...def, ...b }, path), JSON.stringify(b)).toThrow(RangeError);
    expect(() => assertVillagerDefinition(def, undefined)).toThrow(RangeError);
    expect(() => prepareVillagers([def, def], [path], channel)).toThrow(RangeError);
    expect(() => prepareVillagers([{ ...def, pathId: 9 }], [path], channel)).toThrow(RangeError);
    expect(() => pose(Number.NaN)).toThrow(RangeError);
    expect(() => assertVillagerDefinition(def, path)).not.toThrow();
  });

  it("V11 planVillagerInstances: body/head slot = villager index, hats only where worn", () => {
    const villagers = [
      { ...def, villagerId: 4, hat: false },
      { ...def, villagerId: 7, hat: true },
      { ...def, villagerId: 9, hat: true },
    ];
    const plan = planVillagerInstances(villagers);
    expect(plan.villagerIds).toEqual([4, 7, 9]);
    expect(plan.hatSlotOf).toEqual([-1, 0, 1]);
    expect(plan.hatVillagerIds).toEqual([7, 9]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(planVillagerInstances([])).toEqual({ villagerIds: [], hatSlotOf: [], hatVillagerIds: [] });
  });

  it("V12 an empty definition list gives []", () => {
    expect(prepareVillagers([], [path], channel)).toEqual([]);
  });
});
