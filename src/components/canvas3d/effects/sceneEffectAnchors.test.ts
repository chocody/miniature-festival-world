// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_TREES,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { CHIMNEY_SMOKE_LOOK, FALLING_LEAF_LOOK } from "@/config/gimmicks.config";
import { FALLING_LEAF_SLOTS } from "@/config/performance.config";
import { bankSurfaceY, riverFrameAt } from "@/core/world";
import {
  LOY_KRATHONG_HOUSE_SMOKE_ORIGINS,
  LOY_KRATHONG_RIVER_FOLIAGE,
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_TREE_LEAF_ANCHORS,
} from "@/components/models/loyKrathong";
import { foliageBody } from "./propTapTargets";
import { TREE_LEAF_PATH_STRIDE, buildHouseSmokeOrigins, buildTreeLeafAnchors } from "./sceneEffectAnchors";

const layout = LOY_KRATHONG_RIVER_LAYOUT;
const foliage = LOY_KRATHONG_RIVER_FOLIAGE;
const roofKinds = LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.roof);
const lump = LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude;
const leafInput = {
  trees: LOY_KRATHONG_TREES,
  trunks: foliage.trunks,
  clumps: foliage.clumps,
  clumpOwners: foliage.clumpOwners,
  clumpLumpAmplitude: lump,
  channel: layout.channel,
  bankProfile: layout.bankProfile,
  slots: FALLING_LEAF_SLOTS,
};

describe("house smoke origins (MFW-72)", () => {
  it("A1: one origin per house at the roof top + originLiftY; x, z = the house base", () => {
    const lift = CHIMNEY_SMOKE_LOOK.originLiftY;
    const origins = buildHouseSmokeOrigins(layout.houses, roofKinds, RIVER_ENVIRONMENT_PARTS, lift);
    expect(origins).toHaveLength(layout.houses.length);
    expect(roofKinds).toContain("pyramid");
    expect(roofKinds).toContain("gable");
    layout.houses.forEach((h, i) => {
      const s = h.scale;
      const roof = roofKinds[i] === "gable" ? 0.65 + 0.15 : 0.675 + 0.175; // houseRoofGable / houseRoof: yOffset + height / 2
      expect(origins[i].y, `house ${i}`).toBeCloseTo(h.position.y + roof * s + 0.04, 9);
      expect(origins[i].x).toBe(h.position.x);
      expect(origins[i].z).toBe(h.position.z);
    });
    expect(Object.isFrozen(origins)).toBe(true);
    expect(Object.isFrozen(origins[0])).toBe(true);
    expect(() => buildHouseSmokeOrigins(layout.houses, roofKinds.slice(1), RIVER_ENVIRONMENT_PARTS, lift)).toThrow(RangeError);
  });
});

describe("tree leaf anchors (MFW-72)", () => {
  const anchors = buildTreeLeafAnchors(leafInput);

  it("A2: one anchor per tree; every spawn is inside the crown and above its landing; landings sit on the bank, never in the river", () => {
    expect(anchors).toHaveLength(LOY_KRATHONG_TREES.length);
    anchors.forEach((a, i) => {
      expect(a.treeIndex).toBe(i);
      expect(a.slots).toBe(FALLING_LEAF_SLOTS);
      expect(a.paths).toHaveLength(FALLING_LEAF_SLOTS * TREE_LEAF_PATH_STRIDE);
      const crown = foliageBody(foliage.clumps, foliage.clumpOwners, "tree", i, lump, null)!;
      const tree = LOY_KRATHONG_TREES[i];
      const { centerline: c, right } = riverFrameAt(layout.channel, tree.progress);
      for (let k = 0; k < a.slots; k++) {
        const [sx, sy, sz, lx, ly, lz] = a.paths.subarray(k * TREE_LEAF_PATH_STRIDE, (k + 1) * TREE_LEAF_PATH_STRIDE);
        expect(Math.hypot(sx - crown.center.x, sy - crown.center.y, sz - crown.center.z), `tree ${i} leaf ${k}`).toBeLessThanOrEqual(
          crown.radius + 1e-9,
        );
        expect(sy).toBeGreaterThan(ly);
        const offset = tree.side * ((lx - c.x) * right.x + (lz - c.z) * right.z) - layout.channel.width / 2;
        expect(ly - bankSurfaceY(layout.bankProfile, offset)).toBeCloseTo(FALLING_LEAF_LOOK.restLiftY, 9);
        expect(ly).toBeGreaterThan(layout.waterSurfaceY);
      }
    });
  });

  it("A2: the build is deterministic", () => {
    const again = buildTreeLeafAnchors(leafInput);
    expect(again.map((a) => Array.from(a.paths))).toEqual(anchors.map((a) => Array.from(a.paths)));
  });

  it("A2: bad input throws", () => {
    expect(() => buildTreeLeafAnchors({ ...leafInput, trunks: foliage.trunks.slice(1) })).toThrow(RangeError);
    expect(() => buildTreeLeafAnchors({ ...leafInput, slots: 1.5 })).toThrow(RangeError);
  });

  it("A3: the riverLayout constants are frozen and equal the builders on the real layout", () => {
    expect(Object.isFrozen(LOY_KRATHONG_HOUSE_SMOKE_ORIGINS)).toBe(true);
    expect(Object.isFrozen(LOY_KRATHONG_TREE_LEAF_ANCHORS)).toBe(true);
    expect(LOY_KRATHONG_HOUSE_SMOKE_ORIGINS).toEqual(
      buildHouseSmokeOrigins(layout.houses, roofKinds, RIVER_ENVIRONMENT_PARTS, CHIMNEY_SMOKE_LOOK.originLiftY),
    );
    expect(LOY_KRATHONG_TREE_LEAF_ANCHORS.map((a) => [a.treeIndex, a.slots, Array.from(a.paths)])).toEqual(
      anchors.map((a) => [a.treeIndex, a.slots, Array.from(a.paths)]),
    );
  });
});
