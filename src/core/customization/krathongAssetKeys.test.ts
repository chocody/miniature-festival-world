import { describe, expect, it } from "vitest";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_LODS, KRATHONG_RIVER_LOD_BY_TIER } from "@/config/krathongModel.config";
import {
  geometrySpecFor,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  krathongRiverLod,
  materialSpecFor,
  meshSpecFor,
} from "./krathongAssetKeys";
import { buildKrathongMeshData, meshSignedVolume } from "./krathongMeshData";

describe("krathong asset keys", () => {
  it("has one key per catalogue entry, no duplicates", () => {
    const geometryCount = KRATHONG_BASE_IDS.length + LEAF_FOLD_STYLE_IDS.length + FLOWER_KINDS.length + 4; // + flowerCentre (MFW-48)
    const materialCount =
      KRATHONG_BASE_IDS.length + LEAF_COLOR_PALETTE.length + FLOWER_KINDS.length + CANDLE_COLOR_PALETTE.length + 3; // + flowerCentre (MFW-48)
    expect(KRATHONG_GEOMETRY_KEYS).toHaveLength(geometryCount);
    expect(KRATHONG_MATERIAL_KEYS).toHaveLength(materialCount);
    expect(new Set(KRATHONG_GEOMETRY_KEYS).size).toBe(geometryCount);
    expect(new Set(KRATHONG_MATERIAL_KEYS).size).toBe(materialCount);
  });
  it("resolves every key to a spec; materials are matte", () => {
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      expect(geometrySpecFor(key).type).toBeDefined();
      expect(meshSpecFor(key).kind).toBeDefined();
    }
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
      expect(() => meshSpecFor(key as never)).toThrow("unknown krathong mesh key");
    }
  });
  it("every geometry key builds a closed v2 mesh", () => {
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      const data = buildKrathongMeshData(meshSpecFor(key));
      expect(data.triangleCount, key).toBeGreaterThan(0);
      expect(meshSignedVolume(data), key).toBeGreaterThan(0);
    }
  });
  it("the flower centre is a matte yellow part (MFW-48)", () => {
    expect(materialSpecFor("flowerCentre").roughness).toBe(1);
    expect(geometrySpecFor("flowerCentre").type).toBe("sphere");
  });
  it("meshSpecFor: every key has a full, medium and low mesh; full is the default", () => {
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      expect(meshSpecFor(key)).toBe(meshSpecFor(key, "full"));
      for (const lod of KRATHONG_LODS) {
        const data = buildKrathongMeshData(meshSpecFor(key, lod));
        expect(data.triangleCount, `${key}@${lod}`).toBeGreaterThan(0);
      }
    }
    expect(() => meshSpecFor("nope" as never, "low")).toThrow("unknown krathong mesh key");
  });
  it("krathongRiverLod (MFW-69)", () => {
    expect(krathongRiverLod("HIGH")).toBe(KRATHONG_RIVER_LOD_BY_TIER.HIGH);
    expect(krathongRiverLod("MEDIUM")).toBe("medium");
    expect(krathongRiverLod("LOW")).toBe("low");
  });
});
