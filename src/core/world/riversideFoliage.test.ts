// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import { createRiverChannel, facingWaterYaw, resolveBankPlacement, riverFrameAt, type BankPlacement } from "./riverEnvironment";
import {
  bladeTuftExtent,
  foliageClumpsExtent,
  foliageSwayShearAt,
  resolveRiversideFoliage,
  type FoliageClumpDefinition,
  type RiversideFoliageDefinition,
  type TreePlacement,
  type TreeShapeDefinition,
} from "./riversideFoliage";

const channel = createRiverChannel({
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ],
  width: 4,
});
const profile: readonly BankProfilePoint[] = [
  { offset: 0, y: -0.3 },
  { offset: 3, y: 0 },
];
const BANK_WIDTH = 3;
const STEP = 0.7;

const clump = (over: Partial<FoliageClumpDefinition> = {}): FoliageClumpDefinition => ({
  x: 0,
  y: 1,
  z: 0,
  radius: 0.5,
  yawRad: 0,
  keepOnLow: true,
  ...over,
});
const TREE: TreePlacement = { progress: 0.5, side: 1, setback: 1, scale: 2, yawOffsetRad: 0, shape: "round" };
const BUSH: BankPlacement = { progress: 0.3, side: -1, setback: 0.5, scale: 1, yawOffsetRad: 0.4 };
const PLANT: BankPlacement = { progress: 0.7, side: 1, setback: 0.2, scale: 1.5, yawOffsetRad: 0.3 };
const shape = (clumps: readonly FoliageClumpDefinition[], trunkScale = 0.5): TreeShapeDefinition => ({ trunkScale, clumps });

function def(over: Partial<RiversideFoliageDefinition> = {}): RiversideFoliageDefinition {
  return {
    trees: [TREE],
    treeShapes: { round: shape([clump({ x: 1, y: 2, z: 0, radius: 0.5, yawRad: 0.3 })]), tall: shape([clump()]) },
    bushClumps: [clump()],
    plants: [PLANT],
    clumpLumpAmplitude: 0.1,
    swayPhaseStepRad: STEP,
    ...over,
  };
}
const base = (p: BankPlacement) => resolveBankPlacement(channel, p, bankSurfaceY(profile, p.setback));
function env(trees: readonly BankPlacement[] = [TREE], bushes: readonly BankPlacement[] = [BUSH]) {
  return { channel, bankProfile: profile, trees: trees.map(base), bushes: bushes.map(base) };
}

describe("resolveRiversideFoliage (MFW-70)", () => {
  it("F1 placement: trunk at the tree base, clumps rotated by the owner yaw and scaled", () => {
    const e = env();
    const o = e.trees[0];
    const t = o.yawRad;
    const f = resolveRiversideFoliage(e, def(), BANK_WIDTH);
    expect(f.trunks[0].position).toEqual(o.position);
    expect(f.trunks[0].yawRad).toBe(o.yawRad);
    expect(f.trunks[0].scale).toBeCloseTo(2 * 0.5, 9);
    const c = f.clumps[0];
    expect(c.position.x).toBeCloseTo(o.position.x + 1 * 2 * Math.cos(t), 9);
    expect(c.position.y).toBeCloseTo(o.position.y + 4, 9);
    expect(c.position.z).toBeCloseTo(o.position.z - 1 * 2 * Math.sin(t), 9);
    expect(c.scale).toBeCloseTo(1, 9);
    expect(c.yawRad).toBeCloseTo(t + 0.3, 9);
  });

  it("F2 order and LOW subset: tree clumps first, then bush clumps; LOW keeps the keepOnLow ones", () => {
    const d = def({
      treeShapes: { round: shape([clump(), clump({ x: 0.2, keepOnLow: false })]), tall: shape([clump()]) },
      bushClumps: [clump({ y: 0.1 }), clump({ x: 0.1, keepOnLow: false })],
    });
    const f = resolveRiversideFoliage(env(), d, BANK_WIDTH);
    expect(f.clumps).toHaveLength(4);
    const tree = env().trees[0];
    expect(f.clumps[0].swayPivotY).toBe(tree.position.y);
    expect(f.clumps[1].swayPivotY).toBe(tree.position.y);
    expect(f.clumps[2].swayPivotY).toBe(env().bushes[0].position.y);
    expect(f.clumpsLow).toEqual([f.clumps[0], f.clumps[2]]);
    expect(f.clumpsLow[0]).toBe(f.clumps[0]);
  });

  it("F3 sway fields: one pivot and phase per owner; phases step by owner index", () => {
    const d = def({ treeShapes: { round: shape([clump(), clump({ x: 0.3 })]), tall: shape([clump()]) } });
    const e = env();
    const f = resolveRiversideFoliage(e, d, BANK_WIDTH);
    for (const c of f.clumps.slice(0, 2)) {
      expect(c.swayPivotY).toBe(e.trees[0].position.y);
      expect(c.swayPhaseRad).toBe(0);
    }
    expect(f.clumps[2].swayPivotY).toBe(e.bushes[0].position.y);
    expect(f.clumps[2].swayPhaseRad).toBeCloseTo(1 * STEP, 12);
    expect(f.plants[0].swayPhaseRad).toBeCloseTo(2 * STEP, 12);
    expect(f.plants[0].swayPivotY).toBe(f.plants[0].position.y);
  });

  it("F4 plants sit on the bank profile and face the water plus their offset", () => {
    const f = resolveRiversideFoliage(env(), def(), BANK_WIDTH);
    const p = f.plants[0];
    expect(p.position.y).toBeCloseTo(bankSurfaceY(profile, PLANT.setback), 12);
    const { right } = riverFrameAt(channel, PLANT.progress);
    expect(p.yawRad).toBeCloseTo(facingWaterYaw(right, 1) + PLANT.yawOffsetRad, 12);
    expect(p.scale).toBe(PLANT.scale);
  });

  it("is deterministic and frozen", () => {
    const a = resolveRiversideFoliage(env(), def(), BANK_WIDTH);
    const b = resolveRiversideFoliage(env(), def(), BANK_WIDTH);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    for (const list of [a.trunks, a.clumps, a.clumpsLow, a.plants]) expect(Object.isFrozen(list)).toBe(true);
  });

  it("F5 validation: bad definitions throw RangeError", () => {
    const bad: [string, RiversideFoliageDefinition, RegExp?][] = [
      ["tree count", def({ trees: [TREE, TREE] })],
      ["unknown shape", def({ trees: [{ ...TREE, shape: "palm" as never }] })],
      ["empty clumps", def({ treeShapes: { round: shape([]), tall: shape([clump()]) } })],
      ["no keepOnLow", def({ bushClumps: [clump({ keepOnLow: false })] })],
      ["radius 0", def({ bushClumps: [clump({ radius: 0 })] })],
      ["non-finite clump", def({ bushClumps: [clump({ x: Number.NaN })] })],
      ["trunkScale 0", def({ treeShapes: { round: shape([clump()], 0), tall: shape([clump()]) } })],
      ["lump 1", def({ clumpLumpAmplitude: 1 })],
      ["lump -0.1", def({ clumpLumpAmplitude: -0.1 })],
      ["NaN step", def({ swayPhaseStepRad: Number.NaN })],
      ["plant setback = bankWidth", def({ plants: [{ ...PLANT, setback: BANK_WIDTH }] }), /plants\[0\]/],
      ["plant setback -0.1", def({ plants: [{ ...PLANT, setback: -0.1 }] }), /plants\[0\]/],
    ];
    for (const [name, d, message] of bad) {
      expect(() => resolveRiversideFoliage(env(), d, BANK_WIDTH), name).toThrow(RangeError);
      if (message) expect(() => resolveRiversideFoliage(env(), d, BANK_WIDTH), name).toThrow(message);
    }
  });
});

describe("foliage extents and sway shear (MFW-70)", () => {
  it("F6 extents", () => {
    const e = foliageClumpsExtent([clump({ x: 0.3, y: 0.5, z: 0.4, radius: 0.1 })], 0.2);
    expect(e.footprintRadius).toBeCloseTo(0.62, 9);
    expect(e.topY).toBeCloseTo(0.62, 9);
    const t = bladeTuftExtent([{ angleRad: 0, distance: 0.1, height: 1, width: 0.2, leanRad: Math.PI / 6 }]);
    expect(t.footprintRadius).toBeCloseTo(0.7, 9);
    expect(t.topY).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(() => foliageClumpsExtent([], 0.1)).toThrow(RangeError);
    expect(() => bladeTuftExtent([])).toThrow(RangeError);
  });

  it("F7 shear follows shear · sin(2π t / period + phase)", () => {
    const sway = { shear: 0.05, periodMs: 1000 };
    expect(foliageSwayShearAt(0, 0, sway)).toBeCloseTo(0, 12);
    expect(foliageSwayShearAt(250, 0, sway)).toBeCloseTo(0.05, 12);
    expect(Math.abs(foliageSwayShearAt(500, 0, sway))).toBeLessThan(1e-12);
    expect(foliageSwayShearAt(0, Math.PI / 2, sway)).toBeCloseTo(0.05, 12);
    for (let i = 0; i < 100; i++) {
      const t = i * 37;
      const k = foliageSwayShearAt(t, 0.4, sway);
      expect(foliageSwayShearAt(t + 1000, 0.4, sway)).toBeCloseTo(k, 9);
      expect(Math.abs(k)).toBeLessThanOrEqual(0.05);
    }
  });
});

describe("foliage owners (MFW-60)", () => {
  it("RF1: clumpOwners, clumpLowOwners and plantOwners are parallel to their lists; trees first in tree order, then bushes", async () => {
    const { LOY_KRATHONG_RIVER_FOLIAGE: f, LOY_KRATHONG_RIVER_LAYOUT: layout } = await import("@/components/models/loyKrathong/riverLayout");
    expect(f.clumpOwners).toHaveLength(f.clumps.length);
    expect(f.clumpLowOwners).toHaveLength(f.clumpsLow.length);
    expect(f.plantOwners).toEqual(f.plants.map((_, i) => ({ kind: "reed", index: i })));
    const firstBush = f.clumpOwners.findIndex((o) => o.kind === "bush");
    expect(firstBush).toBeGreaterThan(0);
    expect(f.clumpOwners.slice(0, firstBush).every((o) => o.kind === "tree")).toBe(true);
    expect(f.clumpOwners.slice(firstBush).every((o) => o.kind === "bush")).toBe(true);
    const order = (kind: string) => f.clumpOwners.filter((o) => o.kind === kind).map((o) => o.index);
    expect(order("tree")).toEqual([...order("tree")].sort((a, b) => a - b));
    expect(new Set(order("tree")).size).toBe(layout.trees.length);
    expect(new Set(order("bush")).size).toBe(layout.bushes.length);
    // the LIGHT subset keeps its owners: every low clump is the same object as a FULL clump with the same owner
    f.clumpsLow.forEach((c, i) => expect(f.clumpOwners[f.clumps.indexOf(c)]).toBe(f.clumpLowOwners[i]));
  });
});
