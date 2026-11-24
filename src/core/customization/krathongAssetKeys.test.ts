import { describe, expect, it } from "vitest";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import {
  geometrySpecFor,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  materialSpecFor,
} from "./krathongAssetKeys";

describe("krathong asset keys", () => {
  it("has one key per catalogue entry, no duplicates", () => {
    const geometryCount = KRATHONG_BASE_IDS.length + LEAF_FOLD_STYLE_IDS.length + FLOWER_KINDS.length + 3;
    const materialCount =
      KRATHONG_BASE_IDS.length + LEAF_COLOR_PALETTE.length + FLOWER_KINDS.length + CANDLE_COLOR_PALETTE.length + 2;
    expect(KRATHONG_GEOMETRY_KEYS).toHaveLength(geometryCount);
    expect(KRATHONG_MATERIAL_KEYS).toHaveLength(materialCount);
    expect(new Set(KRATHONG_GEOMETRY_KEYS).size).toBe(geometryCount);
    expect(new Set(KRATHONG_MATERIAL_KEYS).size).toBe(materialCount);
  });
  it("resolves every key to a spec; materials are matte", () => {
    for (const key of KRATHONG_GEOMETRY_KEYS) expect(geometrySpecFor(key).type).toBeDefined();
    for (const key of KRATHONG_MATERIAL_KEYS) {
      const spec = materialSpecFor(key);
      expect(spec.roughness).toBe(1);
      expect(spec.metalness).toBe(0);
    }
  });
  it("derives colours and flame emissive", () => {
    expect(materialSpecFor("candle:#FFD166").color).toBe("#FFD166");
    expect(materialSpecFor("flame").emissive).toBeDefined();
  });
  it("throws on unknown keys", () => {
    for (const key of ["base:nope", "candle:#000000", "leaf"]) {
      expect(() => geometrySpecFor(key as never)).toThrow("unknown krathong geometry key");
      expect(() => materialSpecFor(key as never)).toThrow("unknown krathong material key");
    }
  });
});
