import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, type BufferGeometry, type Group, type Mesh } from "three";
import { EnvironmentBlobShadows } from "@/components/canvas3d/BlobShadows";
import { createBlobShadowGeometry, createVertexAlphaGeometry } from "@/components/canvas3d/blobShadowMeshes";
import {
  countTriangles,
  createBankGeometry,
  createInstancedPartGeometry,
  createRibbonGeometry,
  createWaterSurfaceGeometry,
} from "@/components/canvas3d/geometry";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { ShoreHighlights, WaterGlints } from "@/components/canvas3d/WaterHighlights";
import { RIVER_ENVIRONMENT_PARTS, RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY, LIGHT_PRESET_IDS } from "@/config/look.config";
import {
  ENVIRONMENT_RENDER_BUDGETS,
  KRATHONG_RIPPLE_MAX_TRIANGLES,
  WATER_EFFECT_TIERS,
  type RenderTier,
} from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { buildRingFanData, buildShoreHighlightData, type InstanceTransform, type RiverEnvironmentLayout } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { RiverEnvironment } from "./RiverEnvironment";
import {
  LOY_KRATHONG_RIVER_FOLIAGE,
  LOY_KRATHONG_RIVER_LAYOUT as layout,
  foliageForTier,
  houseBodyForTier,
} from "./riverLayout";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: () => {},
}));

const TIERS: readonly RenderTier[] = ["HIGH", "MEDIUM", "LOW"];

interface Summary {
  readonly drawCalls: number;
  readonly triangles: number;
}

/** Counts a geometry's triangles, then disposes it. */
function tris(geometry: BufferGeometry): number {
  const n = countTriangles(geometry);
  geometry.dispose();
  return n;
}

/**
 * Environment main pass, no river krathongs, exactly as MFW-49 plan §5 lists it: one draw call per non-empty mesh, triangles =
 * instances × geometry triangles. Uses the real builders and factories.
 */
/** Since MFW-67 (no lamp light pools) both presets draw the same environment. */
function summarize(l: RiverEnvironmentLayout, tier: RenderTier): Summary {
  let drawCalls = 0;
  let triangles = 0;
  const add = (instances: number, t: number) => {
    if (instances === 0) return;
    drawCalls += 1;
    triangles += instances * t;
  };
  const part = (p: ScenePartSpec, list: readonly InstanceTransform[]) =>
    add(list.length, tris(createInstancedPartGeometry(p.geometry, p.material.flatShading)));
  const parts = RIVER_ENVIRONMENT_PARTS;
  const fan = () => tris(createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY[tier], falloffExponent: BLOB_SHADOW_LOOK.falloffExponent }));
  add(1, tris(createWaterSurfaceGeometry(l.water))); // 1 water (MFW-79: 4 columns)
  add(1, tris(createBankGeometry(l.banks.left))); // 2 bank left
  add(1, tris(createBankGeometry(l.banks.right))); // 3 bank right
  add(1, tris(createRibbonGeometry(l.ground.strips))); // 4 ground strips (MFW-58; per stretch copy)
  part(houseBodyForTier(tier), l.houses); // 5 (MFW-77: LOW draws the lite shell)
  part(parts.houseRoof, l.housesByRoof.pyramid); // 6
  part(parts.houseRoofGable, l.housesByRoof.gable); // 7
  part(parts.houseWindow, l.houseWindows); // 8
  const f = foliageForTier(LOY_KRATHONG_RIVER_FOLIAGE, tier); // MFW-70 foliage variant per tier
  part(f.parts.treeTrunk, f.trunks); // 9
  part(f.parts.leafClump, f.clumps); // 10
  part(f.parts.riversidePlant, f.plants); // 11
  part(parts.rock, l.rocks); // 12
  part(parts.lampPost, l.lamps); // 13
  part(parts.lampHead, l.lamps); // 14
  add(1, tris(new BoxGeometry(l.pier.width, l.pier.thickness, l.pier.length))); // 15 pier deck
  part(parts.pierPile, l.pier.piles); // 16
  add(l.houses.length + l.trees.length + l.lamps.length, fan()); // 17 environment blobs
  add(1, tris(createVertexAlphaGeometry(buildShoreHighlightData(l.channel, RIVER_WATER_HIGHLIGHTS.shore.bandWidth, l.ribbonSegments)))); // 18
  add(WATER_EFFECT_TIERS[tier].glintCount, fan()); // 19 glints
  return { drawCalls, triangles };
}

beforeEach(() => useDeviceStore.setState(useDeviceStore.getInitialState(), true));
afterEach(cleanup);

describe("environment render budget per tier (MFW-49 AC5, lead regression guard)", () => {
  // Both presets draw the same environment since MFW-67 (no NIGHT lamp light pools); the render test below checks each preset.
  it.each(TIERS)("%s: draw calls and triangles stay within ENVIRONMENT_RENDER_BUDGETS in both presets", (tier) => {
    const s = summarize(layout, tier);
    expect(s.drawCalls).toBeLessThanOrEqual(ENVIRONMENT_RENDER_BUDGETS[tier].maxDrawCalls);
    expect(s.triangles).toBeLessThanOrEqual(ENVIRONMENT_RENDER_BUDGETS[tier].maxTriangles);
  });

  it("LOW is never heavier than HIGH", () => {
    expect(summarize(layout, "LOW").triangles).toBeLessThanOrEqual(summarize(layout, "HIGH").triangles);
  });

  it("MFW-70: foliage is three draw calls on every tier and LOW foliage is lighter than MFW-49's (1 128 triangles)", () => {
    // MFW-49 foliage on every tier: 9 canopies (icosahedron detail 1) + 9 trunks (8-segment capped cylinder) + 6 bushes (detail 0).
    const MFW49_FOLIAGE_TRIANGLES = 9 * 80 + 9 * 32 + 6 * 20;
    const foliage = (tier: RenderTier) => {
      const f = foliageForTier(LOY_KRATHONG_RIVER_FOLIAGE, tier);
      const lists = [
        [f.parts.treeTrunk, f.trunks],
        [f.parts.leafClump, f.clumps],
        [f.parts.riversidePlant, f.plants],
      ] as const;
      const calls = lists.filter(([, list]) => list.length > 0).length;
      const triangles = lists.reduce(
        (sum, [p, list]) => sum + list.length * tris(createInstancedPartGeometry(p.geometry, p.material.flatShading)),
        0,
      );
      return { calls, triangles };
    };
    for (const tier of TIERS) expect(foliage(tier).calls, tier).toBe(3);
    expect(foliage("LOW").triangles).toBeLessThanOrEqual(MFW49_FOLIAGE_TRIANGLES);
    expect(foliage("LOW").triangles).toBeLessThan(foliage("HIGH").triangles);
    expect(foliage("LOW").triangles).toBeLessThan(foliage("MEDIUM").triangles);
  });

  it("one krathong ripple ring stays within KRATHONG_RIPPLE_MAX_TRIANGLES", () => {
    expect(tris(createVertexAlphaGeometry(buildRingFanData(RIVER_WATER_HIGHLIGHTS.ripple)))).toBeLessThanOrEqual(
      KRATHONG_RIPPLE_MAX_TRIANGLES,
    );
  });

  it.each(TIERS.flatMap((tier) => LIGHT_PRESET_IDS.map((preset) => [tier, preset] as const)))(
    "%s %s: the rendered environment has exactly the counted draw calls",
    (tier, preset) => {
      useDeviceStore.getState().setQualityTier(tier);
      const { container } = render(
        <>
          <RiverEnvironment
            layout={layout}
            shadows={false}
            waterRef={createRef<Mesh>()}
            onWaterSelected={() => {}}
            lampFocusRef={createRef<Group>()}
            selectedLampIndex={0}
            onLampSelected={() => {}}
            lightPreset={preset}
          />
          <EnvironmentBlobShadows layout={layout} />
          <ShoreHighlights layout={layout} />
          <WaterGlints layout={layout} now={() => 0} />
        </>,
      );
      const meshes = [...container.querySelectorAll("mesh")].filter(
        (el) => !(el.getAttribute("name") ?? "").startsWith(SCENE_OBJECT_NAMES.lampTapPrefix), // invisible tap proxies draw nothing
      );
      const drawn = meshes.length + container.querySelectorAll("instancedMesh").length + container.querySelectorAll("primitive").length;
      expect(drawn).toBe(summarize(layout, tier).drawCalls);
    },
  );
});

describe("MFW-79 water with more depth", () => {
  it("EB1: the water ribbon draws 2 · ribbonSegments · (waterColumns − 1) = 288 triangles", () => {
    expect(layout.waterColumns).toBe(4);
    const triangles = tris(createWaterSurfaceGeometry(layout.water));
    expect(triangles).toBe(2 * layout.ribbonSegments * (layout.waterColumns - 1));
    expect(triangles).toBe(288);
  });
});

describe("MFW-77 fuller village", () => {
  it("EB1: 16 houses (8 + 8 roofs), 80 windows, 14 trees, 10 bushes, 6 rocks, 12 lamps, 12 plants, 52 / 38 leaf clumps", () => {
    expect(layout.houses).toHaveLength(16);
    expect(layout.housesByRoof.pyramid).toHaveLength(8);
    expect(layout.housesByRoof.gable).toHaveLength(8);
    expect(layout.houseWindows).toHaveLength(80);
    expect(layout.trees).toHaveLength(14);
    expect(layout.bushes).toHaveLength(10);
    expect(layout.rocks).toHaveLength(6);
    expect(layout.lamps).toHaveLength(12);
    expect(LOY_KRATHONG_RIVER_FOLIAGE.plants).toHaveLength(12);
    expect(LOY_KRATHONG_RIVER_FOLIAGE.clumps).toHaveLength(52);
    expect(LOY_KRATHONG_RIVER_FOLIAGE.clumpsLow).toHaveLength(38);
  });

  // MFW-77 measured; update with any prop change. MFW-79: +192 water triangles per tier (23 160 / 22 584 / 13 548 before).
  it.each([
    ["HIGH", { drawCalls: 19, triangles: 23_352 }],
    ["MEDIUM", { drawCalls: 19, triangles: 22_776 }],
    ["LOW", { drawCalls: 18, triangles: 13_740 }],
  ] as const)("EB2: %s draws the pinned draw calls and triangles (LOW with the lite house shell)", (tier, expected) => {
    expect(summarize(layout, tier)).toEqual(expected);
  });
});
