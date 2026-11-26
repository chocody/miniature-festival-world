// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { LIVING_WORLD_TIERS } from "@/config/performance.config";
import { E2E_LIVING_WORLD } from "../e2e/fixtures/livingWorld";

describe("living-world e2e literals (MFW-50)", () => {
  it("match the app constants", () => {
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      expect(E2E_LIVING_WORLD.villagerCount[tier]).toBe(LIVING_WORLD_TIERS[tier].villagerCount);
      expect(E2E_LIVING_WORLD.moteCount[tier]).toBe(LIVING_WORLD_TIERS[tier].moteCount);
    }
    expect(E2E_LIVING_WORLD.headsName).toBe(SCENE_OBJECT_NAMES.villagerHeads);
    expect(E2E_LIVING_WORLD.motesName).toBe(SCENE_OBJECT_NAMES.ambientMotes);
    const living = [
      SCENE_OBJECT_NAMES.villagers,
      SCENE_OBJECT_NAMES.villagerBodies,
      SCENE_OBJECT_NAMES.villagerHeads,
      SCENE_OBJECT_NAMES.villagerHats,
      SCENE_OBJECT_NAMES.villagerBlobShadows,
      SCENE_OBJECT_NAMES.ambientMotes,
    ];
    for (const name of living) expect(E2E_LIVING_WORLD.livingPrefixes.some((p) => name.startsWith(p)), name).toBe(true);
  });
});
