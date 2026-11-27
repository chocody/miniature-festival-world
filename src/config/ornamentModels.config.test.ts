import { describe, expect, it } from "vitest";
import { TREE_ORNAMENT_HIT_RADIUS } from "./events/christmas.tree.config";
import {
  CHRISTMAS_MODEL_ASSET_BUDGET,
  ORNAMENT_DESIGN_SOURCES,
  ORNAMENT_FALLBACK_SPHERE_SEGMENTS,
  ORNAMENT_GLB_DESIGN_IDS,
  ORNAMENT_MAX_TRIANGLES_BY_LOD,
  ORNAMENT_WORLD_RADIUS,
  ornamentDesignSource,
  ornamentDesignThumbnailUrl,
  ornamentDesignUrl,
  ornamentFallbackColor,
} from "./ornamentModels.config";

describe("ornament model config (MFW-101)", () => {
  it("OC1: URLs", () => {
    expect(ornamentDesignUrl("ball_01", "medium")).toBe("/models/christmas/ball_01.medium.glb");
    expect(ornamentDesignThumbnailUrl("star_01")).toBe("/ui/ornament-designs/star_01.png");
  });

  it("OC2: triangle guards and asset budget", () => {
    expect(ORNAMENT_MAX_TRIANGLES_BY_LOD).toEqual({ full: 4000, medium: 400, low: 100 });
    expect(CHRISTMAS_MODEL_ASSET_BUDGET).toEqual({ maxFileBytes: 262144, maxPublicTotalBytes: 1572864, maxSourceTotalBytes: 655360 });
  });

  it("OC3: the registry holds exactly the three glb designs; others fall back to the default tint", () => {
    expect(Object.keys(ORNAMENT_DESIGN_SOURCES).sort()).toEqual(["ball_01", "bow_01", "star_01"]);
    for (const source of Object.values(ORNAMENT_DESIGN_SOURCES)) expect(source?.kind).toBe("glb");
    expect([...ORNAMENT_GLB_DESIGN_IDS]).toEqual(["ball_01", "star_01", "bow_01"]);
    expect(ornamentDesignSource("bell_01")).toBeNull();
    expect(ornamentFallbackColor("bell_01")).toBe(ornamentFallbackColor("ball_01"));
  });

  it("OC4: world radius = hit radius; the fallback sphere fits the low guard", () => {
    expect(ORNAMENT_WORLD_RADIUS).toBe(TREE_ORNAMENT_HIT_RADIUS);
    const { width, height } = ORNAMENT_FALLBACK_SPHERE_SEGMENTS;
    expect(2 * width * (height - 1)).toBeLessThanOrEqual(ORNAMENT_MAX_TRIANGLES_BY_LOD.low);
  });
});
