// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_RIVER_VILLAGER_COUNT } from "@/config/fallback2d.config";
import { LOY_KRATHONG_VILLAGERS, VILLAGER_MOTION } from "@/config/events/loyKrathong.life.config";
import { LOY_KRATHONG_RIVERSIDE_PATHS } from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_RIVER_LAYOUT } from "@/components/models/loyKrathong/riverLayout"; // three-based reference (tests only)
import { createVillagerPoseOut, prepareVillagers, villagerPoseInto } from "@/core/world/villagers";
import { resolveFlatVillagers } from "./flatVillagers";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";

const layout = LOY_KRATHONG_RIVER_LAYOUT;
const { scene, villagers } = getLoyKrathongFlatRiver();

describe("flat villagers = the 3D STAND pose (MFW-51, invariant B)", () => {
  it("T69 every villager stands where villagerPoseInto(animated = false) puts it", () => {
    const flat = resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, LOY_KRATHONG_VILLAGERS, LOY_KRATHONG_VILLAGERS.length);
    const prepared = prepareVillagers(LOY_KRATHONG_VILLAGERS, layout.paths, layout.channel);
    expect(flat).toHaveLength(LOY_KRATHONG_VILLAGERS.length);
    expect(LOY_KRATHONG_VILLAGERS.some((v) => v.watch === null)).toBe(true); // pins FLAT_VILLAGER_STAND_FRACTION
    const out = createVillagerPoseOut();
    prepared.forEach((v, i) => {
      villagerPoseInto(v, layout.channel, layout.bankProfile, VILLAGER_MOTION, 0, false, out);
      expect(Math.abs(flat[i].x - out.x), `villager ${v.def.villagerId} x`).toBeLessThan(1e-9);
      expect(Math.abs(flat[i].z - out.z), `villager ${v.def.villagerId} z`).toBeLessThan(1e-9);
    });
  });

  it("T70 the 2D river shows the LOW count, with ids, hats and sides from config", () => {
    expect(villagers).toHaveLength(FLAT_RIVER_VILLAGER_COUNT);
    villagers.forEach((v, i) => {
      const def = LOY_KRATHONG_VILLAGERS[i];
      expect(v.villagerId).toBe(def.villagerId);
      expect(v.hat).toBe(def.hat);
      expect(v.scale).toBe(def.scale);
      expect(v.side).toBe(LOY_KRATHONG_RIVERSIDE_PATHS.find((p) => p.pathId === def.pathId)!.side);
    });
    expect(Object.isFrozen(villagers)).toBe(true);
  });

  it("T71 rejects an unknown path and a bad count", () => {
    const bad = [{ ...LOY_KRATHONG_VILLAGERS[0], pathId: 99 }];
    expect(() => resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, bad, 1)).toThrow(RangeError);
    expect(() => resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, LOY_KRATHONG_VILLAGERS, -1)).toThrow(RangeError);
    expect(() => resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, LOY_KRATHONG_VILLAGERS, 1.5)).toThrow(RangeError);
    expect(resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, LOY_KRATHONG_VILLAGERS, 0)).toEqual([]);
  });
});
