import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BufferGeometry, InstancedMesh } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { LOY_KRATHONG_VILLAGERS } from "@/config/events/loyKrathong.life.config";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY } from "@/config/look.config";
import { LIVING_WORLD_RENDER_BUDGETS, LIVING_WORLD_TIERS, type RenderTier } from "@/config/performance.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { AmbientLife } from "./AmbientLife";
import { createMoteGeometry, createMoteMaterial } from "./ambientMeshes";
import { createBlobShadowGeometry, createBlobShadowMaterial } from "./blobShadowMeshes";
import { countTriangles, createInstancedPartMaterial } from "./geometry";
import { createVillagerAssets, disposeVillagerAssets } from "./villagerMeshes";
import { Villagers } from "./Villagers";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: () => {},
}));

const TIERS: readonly RenderTier[] = ["HIGH", "MEDIUM", "LOW"];

function tris(geometry: BufferGeometry): number {
  const n = countTriangles(geometry);
  geometry.dispose();
  return n;
}

/**
 * Living-world main pass (MFW-50 plan §2, silhouettes per the owner update): body + head (+ hat when any villager wears one) +
 * villager blobs (the tier fan) + motes (when any). Real factories; triangles = instances × geometry triangles.
 */
function summarize(tier: RenderTier): { drawCalls: number; triangles: number } {
  const t = LIVING_WORLD_TIERS[tier];
  const villagers = LOY_KRATHONG_VILLAGERS.slice(0, t.villagerCount);
  const hats = villagers.filter((v) => v.hat).length;
  const assets = createVillagerAssets();
  let drawCalls = 0;
  let triangles = 0;
  const add = (instances: number, perInstance: number) => {
    if (instances === 0) return;
    drawCalls += 1;
    triangles += instances * perInstance;
  };
  add(villagers.length, countTriangles(assets.bodyGeometry));
  add(villagers.length, countTriangles(assets.headGeometry));
  add(hats, countTriangles(assets.hatGeometry));
  add(villagers.length, tris(createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY[tier], falloffExponent: BLOB_SHADOW_LOOK.falloffExponent })));
  add(t.moteCount, tris(createMoteGeometry()));
  disposeVillagerAssets(assets);
  return { drawCalls, triangles };
}

beforeEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));
afterEach(cleanup);

describe("living-world render budget (MFW-50 AC2, lead regression guard)", () => {
  it.each(TIERS)("B1 %s: within LIVING_WORLD_RENDER_BUDGETS", (tier) => {
    const s = summarize(tier);
    expect(s.drawCalls).toBeLessThanOrEqual(LIVING_WORLD_RENDER_BUDGETS[tier].maxDrawCalls);
    expect(s.triangles).toBeLessThanOrEqual(LIVING_WORLD_RENDER_BUDGETS[tier].maxTriangles);
  });

  it("B1 exact counts and non-increasing budgets from HIGH to LOW", () => {
    expect(summarize("HIGH")).toEqual({ drawCalls: 5, triangles: 1_232 });
    expect(summarize("MEDIUM")).toEqual({ drawCalls: 5, triangles: 712 });
    expect(summarize("LOW")).toEqual({ drawCalls: 4, triangles: 180 });
    for (const key of ["maxDrawCalls", "maxTriangles"] as const) {
      expect(LIVING_WORLD_RENDER_BUDGETS.MEDIUM[key]).toBeLessThanOrEqual(LIVING_WORLD_RENDER_BUDGETS.HIGH[key]);
      expect(LIVING_WORLD_RENDER_BUDGETS.LOW[key]).toBeLessThanOrEqual(LIVING_WORLD_RENDER_BUDGETS.MEDIUM[key]);
    }
    expect(Object.isFrozen(LIVING_WORLD_RENDER_BUDGETS)).toBe(true);
  });

  it.each(TIERS)("B2 %s: the rendered living world has exactly the counted draw calls", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(
      <>
        <Villagers layout={layout} now={() => 0} />
        <AmbientLife
          layout={layout}
          now={() => 0}
          lightPreset="NIGHT"
          lampHeadMeshRef={createRef<InstancedMesh>()}
          idleRedraw
        />
      </>,
    );
    expect(container.querySelectorAll("primitive")).toHaveLength(summarize(tier).drawCalls);
  });

  it("B3 no new shader program: villager material = environment part material; mote material = blob fan material", () => {
    const assets = createVillagerAssets();
    const env = createInstancedPartMaterial(RIVER_ENVIRONMENT_PARTS.lampPost.material);
    for (const key of ["type", "flatShading", "vertexColors", "transparent", "toneMapped", "side"] as const) {
      expect(assets.material[key], key).toEqual(env[key]);
    }
    const mote = createMoteMaterial("NIGHT");
    const blob = createBlobShadowMaterial();
    for (const key of ["type", "vertexColors", "transparent", "depthWrite", "toneMapped", "side", "blending"] as const) {
      expect(mote[key], key).toEqual(blob[key]);
    }
    const moteGeometry = createMoteGeometry();
    expect(moteGeometry.getAttribute("color").itemSize).toBe(4); // the blob fans' RGBA attribute (same vertex-colour variant)
    for (const g of [assets.bodyGeometry, assets.headGeometry, assets.hatGeometry]) expect(g.getAttribute("color")).toBeUndefined();
    moteGeometry.dispose();
    disposeVillagerAssets(assets);
    env.dispose();
    mote.dispose();
    blob.dispose();
  });
});
