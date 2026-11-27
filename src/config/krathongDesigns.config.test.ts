// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assembleKrathong, DEFAULT_KRATHONG_APPEARANCE, meshSpecFor, type KrathongPartInstance } from "@/core/customization";
import { buildKrathongMeshData } from "@/core/customization/krathongMeshData";
import {
  KRATHONG_DEFAULT_DESIGN,
  KRATHONG_DESIGN_ASSET_BUDGET,
  KRATHONG_DESIGN_BODY_MATERIAL,
  KRATHONG_DESIGN_FOOTPRINT,
  KRATHONG_DESIGN_IDS,
  KRATHONG_DESIGN_MAX_FLAMES,
  KRATHONG_DESIGN_PUBLIC_PATH,
  krathongDesignUrl,
} from "./krathongDesigns.config";
import { KRATHONG_MATTE_SURFACE } from "./krathongModel.config";

/** Horizontal half-extent of a part's full mesh under T(offset + localPosition) · R_y(rotationY) · S(scale): max |x|, |z| of its box. */
function partHorizontalRadius(part: KrathongPartInstance, offset: readonly [number, number, number]): number {
  const { positions } = buildKrathongMeshData(meshSpecFor(part.geometryKey, "full"));
  const cos = Math.cos(part.rotationY);
  const sin = Math.sin(part.rotationY);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; // prettier-ignore
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] * part.scale[0];
    const z = positions[i + 2] * part.scale[2];
    // three's R_y: x' = x cos + z sin, z' = −x sin + z cos.
    const wx = x * cos + z * sin + part.localPosition[0] + offset[0];
    const wz = -x * sin + z * cos + part.localPosition[2] + offset[2];
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ));
}

function proceduralDefaultRadius(): number {
  const assembly = assembleKrathong(DEFAULT_KRATHONG_APPEARANCE);
  const none = [0, 0, 0] as const;
  return Math.max(
    ...assembly.body.map((p) => partHorizontalRadius(p, none)),
    ...assembly.centerAnchor.parts.map((p) => partHorizontalRadius(p, assembly.centerAnchor.localPosition)),
  );
}

describe("krathong designs config (MFW-65)", () => {
  it("KC1: ids, default, URLs, budgets", () => {
    expect(KRATHONG_DESIGN_IDS).toEqual(["banana_leaf_01"]);
    expect(KRATHONG_DESIGN_IDS).toContain(KRATHONG_DEFAULT_DESIGN);
    expect(KRATHONG_DESIGN_PUBLIC_PATH).toBe("/models/krathong");
    expect(krathongDesignUrl("banana_leaf_01", "medium")).toBe("/models/krathong/banana_leaf_01.medium.glb");
    expect(Number.isInteger(KRATHONG_DESIGN_MAX_FLAMES) && KRATHONG_DESIGN_MAX_FLAMES > 0).toBe(true);
    for (const value of Object.values(KRATHONG_DESIGN_ASSET_BUDGET)) expect(Number.isInteger(value) && value > 0).toBe(true);
    expect(KRATHONG_DESIGN_BODY_MATERIAL).toEqual({ ...KRATHONG_MATTE_SURFACE, color: "#FFFFFF", vertexColors: true });
    for (const value of [KRATHONG_DESIGN_IDS, KRATHONG_DESIGN_FOOTPRINT, KRATHONG_DESIGN_ASSET_BUDGET, KRATHONG_DESIGN_BODY_MATERIAL])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it("KC2: the footprint radius is the procedural default krathong's horizontal radius (±5 %)", () => {
    const radius = proceduralDefaultRadius();
    expect(Math.abs(KRATHONG_DESIGN_FOOTPRINT.radius - radius) / radius).toBeLessThanOrEqual(0.05);
    expect(KRATHONG_DESIGN_FOOTPRINT.bottomY).toBe(-0.18);
  });
});
