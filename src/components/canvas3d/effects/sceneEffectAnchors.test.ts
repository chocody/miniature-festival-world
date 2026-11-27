// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { LOY_KRATHONG_HOUSE_MODEL } from "@/config/events/loyKrathong.houseModel";
import {
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_TREES,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { CHIMNEY_SMOKE_LOOK, FALLING_LEAF_LOOK, HOUSE_CHIMNEY_TOP_LOCAL } from "@/config/gimmicks.config";
import { LOOK_PALETTE } from "@/config/look.config";
import type { StaticPartMesh } from "@/config/scene.config";
import { FALLING_LEAF_SLOTS } from "@/config/performance.config";
import { bankSurfaceY, riverFrameAt } from "@/core/world";
import {
  LOY_KRATHONG_HOUSE_SMOKE_ORIGINS,
  LOY_KRATHONG_RIVER_FOLIAGE,
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_TREE_LEAF_ANCHORS,
} from "@/components/models/loyKrathong";
import { composeInstanceMatrix } from "../instancing";
import { foliageBody } from "./propTapTargets";
import { TREE_LEAF_PATH_STRIDE, buildHouseSmokeOrigins, buildTreeLeafAnchors } from "./sceneEffectAnchors";

const layout = LOY_KRATHONG_RIVER_LAYOUT;
const foliage = LOY_KRATHONG_RIVER_FOLIAGE;
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

describe("house smoke origins (MFW-72 / MFW-84: the chimney)", () => {
  it("A1: the chimney top goes through the house transform (yaw about +Y, scale) plus liftY; frozen", () => {
    const c = { x: -0.2, y: 0.7, z: 0.1 };
    const [a] = buildHouseSmokeOrigins([{ position: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1 }], c, 0.04);
    expect(a.x).toBeCloseTo(-0.2, 9);
    expect(a.y).toBeCloseTo(0.74, 9);
    expect(a.z).toBeCloseTo(0.1, 9);
    const origins = buildHouseSmokeOrigins([{ position: { x: 1, y: -0.14, z: 3 }, yawRad: Math.PI / 2, scale: 2 }], c, 0.04);
    expect(origins[0].x).toBeCloseTo(1.2, 9);
    expect(origins[0].y).toBeCloseTo(1.3, 9);
    expect(origins[0].z).toBeCloseTo(3.4, 9);
    expect(buildHouseSmokeOrigins([], c, 0.04)).toEqual([]);
    expect(Object.isFrozen(origins)).toBe(true);
    expect(Object.isFrozen(origins[0])).toBe(true);
  });

  it("A1b: every origin sits on the rendered chimney (the house body instance matrix applied to the chimney top), whatever the yaw", () => {
    const body = RIVER_ENVIRONMENT_PARTS.houseBody;
    const c = HOUSE_CHIMNEY_TOP_LOCAL;
    const m = new Matrix4();
    const v = new Vector3();
    expect(new Set(layout.houses.map((h) => h.yawRad)).size).toBeGreaterThan(1);
    layout.houses.forEach((h, i) => {
      v.set(c.x, c.y - body.yOffset, c.z).applyMatrix4(composeInstanceMatrix(h, body, m));
      const o = LOY_KRATHONG_HOUSE_SMOKE_ORIGINS[i];
      expect(Math.abs(v.x - o.x), `house ${i} x`).toBeLessThan(1e-9);
      expect(Math.abs(v.y - (o.y - CHIMNEY_SMOKE_LOOK.originLiftY)), `house ${i} y`).toBeLessThan(1e-9);
      expect(Math.abs(v.z - o.z), `house ${i} z`).toBeLessThan(1e-9);
    });
  });

  it.each(["shell", "liteShell"] as const)("A1c: HOUSE_CHIMNEY_TOP_LOCAL is the top centre of the chimney cap of the %s", (key) => {
    const sh: StaticPartMesh = LOY_KRATHONG_HOUSE_MODEL[key];
    const wood = sh.palette.findIndex((hex) => hex.toLowerCase() === LOOK_PALETTE.woodDark.toLowerCase());
    expect(wood).toBeGreaterThanOrEqual(0);
    const box = { minX: Infinity, maxX: -Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    let faces = 0;
    for (let f = 0; f < sh.indices.length / 3; f++) {
      if (sh.faceColors?.[f] !== wood) continue;
      const vs = [0, 1, 2].map((j) => sh.indices[3 * f + j]);
      if (!vs.every((vi) => sh.positions[3 * vi + 1] + sh.centerY > LOY_KRATHONG_HOUSE_MODEL.roof.centerY)) continue;
      faces++;
      for (const vi of vs) {
        box.minX = Math.min(box.minX, sh.positions[3 * vi]);
        box.maxX = Math.max(box.maxX, sh.positions[3 * vi]);
        box.maxY = Math.max(box.maxY, sh.positions[3 * vi + 1] + sh.centerY);
        box.minZ = Math.min(box.minZ, sh.positions[3 * vi + 2]);
        box.maxZ = Math.max(box.maxZ, sh.positions[3 * vi + 2]);
      }
    }
    expect(faces).toBeGreaterThanOrEqual(1);
    expect(Math.abs((box.minX + box.maxX) / 2 - HOUSE_CHIMNEY_TOP_LOCAL.x)).toBeLessThan(1e-3);
    expect(Math.abs(box.maxY - HOUSE_CHIMNEY_TOP_LOCAL.y)).toBeLessThan(1e-3);
    expect(Math.abs((box.minZ + box.maxZ) / 2 - HOUSE_CHIMNEY_TOP_LOCAL.z)).toBeLessThan(1e-3);
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
      buildHouseSmokeOrigins(layout.houses, HOUSE_CHIMNEY_TOP_LOCAL, CHIMNEY_SMOKE_LOOK.originLiftY),
    );
    expect(LOY_KRATHONG_TREE_LEAF_ANCHORS.map((a) => [a.treeIndex, a.slots, Array.from(a.paths)])).toEqual(
      anchors.map((a) => [a.treeIndex, a.slots, Array.from(a.paths)]),
    );
  });
});
