// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Color, FrontSide, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry } from "three";
import { LOY_KRATHONG_HOUSE_MODEL } from "@/config/events/loyKrathong.houseModel";
import { KRATHONG_DESIGN_BODY_MATERIAL } from "@/config/krathongDesigns.config";
import {
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_FOLIAGE_PARTS,
  RIVER_WATER_HIGHLIGHTS,
} from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY, WATER_HIGHLIGHT_LOOK } from "@/config/look.config";
import { TOY_MATTE_MATERIALS, type MatteMaterialSpec } from "@/config/scene.config";
import { LAMP_GROUND_LIGHT_LOOK } from "@/config/gimmicks.config";
import { buildRingFanData, buildShoreHighlightData } from "@/core/world";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { createBlobShadowGeometry, createBlobShadowMaterial, createFanMaterial, createVertexAlphaGeometry } from "./blobShadowMeshes";
import { createInstancedPartMaterial, createMatteMaterial, createStaticMeshGeometry } from "./geometry";

/**
 * MFW-49 "no new shader variant" guard: every environment material keeps the parameters of one of the two programs the
 * scene already compiles (the lit matte program and the blob fan program), so the riverside v2 adds zero programs.
 * The e2e perf-audit / perf-probe program count is the authority; this is the cheap unit guard.
 */
describe("environment programs (MFW-49 AC5)", () => {
  it("every lit environment material shares the matte program parameters", () => {
    const water: MatteMaterialSpec = { color: TOY_MATTE_MATERIALS.water.color, roughness: 1, metalness: 0, flatShading: false };
    const materials = [
      // MFW-66: the vertex-coloured house shell uses the krathong design-body variant (checked in the P1 case below).
      ...Object.values(RIVER_ENVIRONMENT_PARTS)
        .filter((p) => p !== RIVER_ENVIRONMENT_PARTS.houseBody)
        .map((p) => createInstancedPartMaterial(p.material)),
      ...[RIVER_BANK_MATERIAL, PIER_DECK_MATERIAL, RIVER_BANK_MATERIAL /* ground */, water].map(createMatteMaterial),
    ];
    for (const m of materials) {
      expect(m).toBeInstanceOf(MeshStandardMaterial);
      expect(m.flatShading).toBe(false);
      expect(m.vertexColors).toBe(false);
      expect(m.toneMapped).toBe(true);
      expect(m.transparent).toBe(false);
      expect(m.side).toBe(FrontSide);
      m.dispose();
    }
  });

  it("P1 (MFW-66): the house shell shares the MFW-65 design-body program (vertex colours, RGBA bytes)", () => {
    const m = createInstancedPartMaterial(RIVER_ENVIRONMENT_PARTS.houseBody.material);
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect(m.vertexColors).toBe(true);
    expect(m.flatShading).toBe(false);
    expect(m.side).toBe(FrontSide);
    expect(m.transparent).toBe(false);
    expect(m.roughness).toBe(KRATHONG_DESIGN_BODY_MATERIAL.roughness);
    expect(m.metalness).toBe(KRATHONG_DESIGN_BODY_MATERIAL.metalness);
    expect(m.color.getHexString()).toBe(new Color(KRATHONG_DESIGN_BODY_MATERIAL.color).getHexString());
    m.dispose();
    const g = createStaticMeshGeometry(LOY_KRATHONG_HOUSE_MODEL.shell);
    const color = g.getAttribute("color");
    expect(color.itemSize).toBe(4);
    expect(color.normalized).toBe(true);
    expect(color.array).toBeInstanceOf(Uint8Array);
    g.dispose();
  });

  it("every fan material (blobs, shore, glints, ripples, MFW-75 lamp ground light) shares the blob program parameters", () => {
    const fans = [
      createBlobShadowMaterial(),
      createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.shoreOpacity, additive: false }),
      createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.glintOpacity, additive: false }),
      createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.rippleOpacity, additive: false }),
      createFanMaterial({ color: LAMP_GROUND_LIGHT_LOOK.color, opacity: LAMP_GROUND_LIGHT_LOOK.opacity, additive: false }),
    ];
    for (const m of fans) {
      expect(m).toBeInstanceOf(MeshBasicMaterial);
      expect(m.vertexColors).toBe(true);
      expect(m.transparent).toBe(true);
      expect(m.toneMapped).toBe(true);
      expect(m.side).toBe(FrontSide);
      expect(m.alphaTest).toBe(0);
      m.dispose();
    }
  });

  it("P5: LIGHT foliage parts share the FULL material specs (MFW-70: no new program, no material re-creation on a tier drop)", () => {
    for (const key of ["treeTrunk", "leafClump", "riversidePlant"] as const) {
      expect(RIVER_FOLIAGE_PARTS.LIGHT[key].material, key).toBe(RIVER_FOLIAGE_PARTS.FULL[key].material);
      expect(RIVER_FOLIAGE_PARTS.FULL[key], key).toBe(RIVER_ENVIRONMENT_PARTS[key]);
    }
  });

  it("the blob material is unchanged by the fan factory refactor", () => {
    const m = createBlobShadowMaterial();
    expect(m.color.getHexString()).toBe(BLOB_SHADOW_LOOK.color.slice(1).toLowerCase());
    expect(m.opacity).toBe(BLOB_SHADOW_LOOK.opacity);
    expect(m.depthWrite).toBe(false);
    expect(m.polygonOffset).toBe(true);
    expect(m.polygonOffsetFactor).toBe(BLOB_SHADOW_LOOK.polygonOffsetFactor);
    expect(m.polygonOffsetUnits).toBe(BLOB_SHADOW_LOOK.polygonOffsetUnits);
    m.dispose();
  });

  it("the fan geometries carry an RGBA colour attribute", () => {
    const geometries: BufferGeometry[] = [
      createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY.HIGH, falloffExponent: BLOB_SHADOW_LOOK.falloffExponent }),
      createVertexAlphaGeometry(buildShoreHighlightData(layout.channel, RIVER_WATER_HIGHLIGHTS.shore.bandWidth, layout.ribbonSegments)),
      createVertexAlphaGeometry(buildRingFanData(RIVER_WATER_HIGHLIGHTS.ripple)),
    ];
    for (const g of geometries) {
      expect(g.getAttribute("color").itemSize).toBe(4);
      g.dispose();
    }
  });
});
