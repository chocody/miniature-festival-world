import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { RIVER_FOLIAGE_PARTS, RIVER_FOLIAGE_SWAY } from "@/config/events/loyKrathong.river.config";
import type { QualityTier } from "@/config/performance.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiversideFoliage } from "./RiversideFoliage";
import { LOY_KRATHONG_RIVER_FOLIAGE as foliage } from "./riverLayout";

const recorded = vi.hoisted(() => ({ parts: [] as Record<string, unknown>[], swaying: [] as Record<string, unknown>[] }));
vi.mock("@/components/canvas3d/InstancedPart", () => ({
  InstancedPart: (props: Record<string, unknown>) => {
    recorded.parts.push(props);
    return null;
  },
}));
vi.mock("@/components/canvas3d/SwayingInstancedPart", () => ({
  SwayingInstancedPart: (props: Record<string, unknown>) => {
    recorded.swaying.push(props);
    return null;
  },
}));

function renderAt(tier: QualityTier, reducedMotion = false) {
  useDeviceStore.getState().setQualityTier(tier);
  useDeviceStore.getState().setReducedMotion(reducedMotion);
  recorded.parts.length = 0;
  recorded.swaying.length = 0;
  render(<RiversideFoliage foliage={foliage} shadows={false} />);
  const trunk = recorded.parts[recorded.parts.length - 1];
  const byName = (name: string) => recorded.swaying.filter((p) => p.name === name).at(-1)!;
  return { trunk, clumps: byName(SCENE_OBJECT_NAMES.leafClumps), plants: byName(SCENE_OBJECT_NAMES.riversidePlants) };
}

beforeEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));
afterEach(cleanup);

describe("RiversideFoliage (MFW-70)", () => {
  it.each(["HIGH", "MEDIUM"] as const)("V1 %s: FULL parts, every clump, and both meshes sway", (tier) => {
    const { trunk, clumps, plants } = renderAt(tier);
    expect(trunk.name).toBe(SCENE_OBJECT_NAMES.treeTrunks);
    expect(trunk.part).toBe(RIVER_FOLIAGE_PARTS.FULL.treeTrunk);
    expect(trunk.transforms).toBe(foliage.trunks);
    expect(clumps.part).toBe(RIVER_FOLIAGE_PARTS.FULL.leafClump);
    expect(clumps.instances).toBe(foliage.clumps);
    expect(clumps.sway).toBe(RIVER_FOLIAGE_SWAY.leafClump);
    expect(plants.part).toBe(RIVER_FOLIAGE_PARTS.FULL.riversidePlant);
    expect(plants.instances).toBe(foliage.plants);
    expect(plants.sway).toBe(RIVER_FOLIAGE_SWAY.riversidePlant);
  });

  it.each(["LOW", "FALLBACK_2D"] as const)("V2 %s: LIGHT parts, the keepOnLow clumps, static", (tier) => {
    const { trunk, clumps, plants } = renderAt(tier);
    expect(trunk.part).toBe(RIVER_FOLIAGE_PARTS.LIGHT.treeTrunk);
    expect(clumps.part).toBe(RIVER_FOLIAGE_PARTS.LIGHT.leafClump);
    expect(clumps.instances).toBe(foliage.clumpsLow);
    expect(plants.part).toBe(RIVER_FOLIAGE_PARTS.LIGHT.riversidePlant);
    expect(clumps.sway).toBeNull();
    expect(plants.sway).toBeNull();
  });

  it("V3 reduced motion on HIGH: FULL parts, static", () => {
    const { trunk, clumps, plants } = renderAt("HIGH", true);
    expect(trunk.part).toBe(RIVER_FOLIAGE_PARTS.FULL.treeTrunk);
    expect(clumps.part).toBe(RIVER_FOLIAGE_PARTS.FULL.leafClump);
    expect(clumps.instances).toBe(foliage.clumps);
    expect(clumps.sway).toBeNull();
    expect(plants.sway).toBeNull();
  });
});
