import { FrontSide, MeshStandardMaterial, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import { KRATHONG_MAX_TRIANGLES } from "@/config/krathongModel.config";
import {
  assembleKrathong,
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  meshSpecFor,
  type KrathongAppearance,
} from "@/core/customization";
import { buildKrathongMeshData, countKrathongTriangles } from "@/core/customization/krathongMeshData";
import { createKrathongAssets } from "./krathongAssets";

const countTriangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
/** v1 default krathong at BASE 9c98d1c (MFW-47): 1360 triangles, measured from the primitive geometries. */
const V1_DEFAULT_TRIANGLES = 1360;
/** Lead guard for the e2e fixture E2E_APPEARANCE (banana, style_01, one marigold); v1 = 380. */
const E2E_FIXTURE_MAX_TRIANGLES = 560;

const parts = (a: KrathongAppearance) => {
  const assembly = assembleKrathong(a);
  return [...assembly.body, ...assembly.centerAnchor.parts];
};

describe("createKrathongAssets", () => {
  it("returns the same object per key and distinct objects across keys", () => {
    const assets = createKrathongAssets();
    expect(assets.geometry("candle")).toBe(assets.geometry("candle"));
    expect(assets.material("leaf:#5E8C3A")).toBe(assets.material("leaf:#5E8C3A"));
    expect(assets.geometry("base:banana_trunk_01")).not.toBe(assets.geometry("base:toy_bread_01"));
    expect(assets.listGeometries()).toHaveLength(KRATHONG_GEOMETRY_KEYS.length);
    expect(assets.listMaterials()).toHaveLength(KRATHONG_MATERIAL_KEYS.length);
  });

  it("shares geometry and material across krathongs", () => {
    const assets = createKrathongAssets();
    const a = DEFAULT_KRATHONG_APPEARANCE;
    const b: KrathongAppearance = {
      base: "toy_bread_01",
      lotusFold: "style_02",
      leafColor: "#8DB255",
      flowers: ["orchid", "lotus", "orchid"],
      candleColor: "#FF9F6B",
    };
    const all = [...parts(a), ...parts(b)];
    expect(new Set(all.map((p) => assets.geometry(p.geometryKey))).size).toBeLessThanOrEqual(KRATHONG_GEOMETRY_KEYS.length);
    expect(new Set(all.map((p) => assets.material(p.materialKey))).size).toBeLessThanOrEqual(KRATHONG_MATERIAL_KEYS.length);
    const flowers = parts(a).filter((p) => p.role === "flower");
    expect(new Set(flowers.map((p) => assets.geometry(p.geometryKey))).size).toBe(1);
    expect(new Set(flowers.map((p) => assets.material(p.materialKey))).size).toBe(1);
    const candleOf = (x: KrathongAppearance) => parts(x).find((p) => p.role === "candle")!;
    expect(assets.geometry(candleOf(a).geometryKey)).toBe(assets.geometry(candleOf(b).geometryKey));
  });

  it("builds matte standard materials", () => {
    for (const material of createKrathongAssets().listMaterials()) {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
    }
  });

  it("disposes every object exactly once", () => {
    const assets = createKrathongAssets();
    const spies = [...assets.listGeometries(), ...assets.listMaterials()].map((o) => vi.spyOn(o, "dispose"));
    assets.dispose();
    assets.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("MFW-48: every geometry is the v2 mesh with smooth normals", () => {
    const assets = createKrathongAssets();
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      const g = assets.geometry(key);
      expect(countTriangles(g), key).toBe(buildKrathongMeshData(meshSpecFor(key)).triangleCount);
      expect(g.getAttribute("normal"), key).toBeDefined();
      expect(g.boundingSphere, key).not.toBeNull();
    }
  });

  it("MFW-48: per-krathong triangles: worst ≤ KRATHONG_MAX_TRIANGLES, default ≤ v1 default, e2e fixture ≤ 560", () => {
    let worst = 0;
    for (const base of KRATHONG_BASE_IDS)
      for (const lotusFold of LEAF_FOLD_STYLE_IDS)
        for (const kind of FLOWER_KINDS)
          worst = Math.max(
            worst,
            countKrathongTriangles({ ...DEFAULT_KRATHONG_APPEARANCE, base, lotusFold, flowers: new Array(RIM_SOCKET_COUNT).fill(kind) }),
          );
    expect(worst).toBeLessThanOrEqual(KRATHONG_MAX_TRIANGLES);
    expect(countKrathongTriangles(DEFAULT_KRATHONG_APPEARANCE)).toBeLessThanOrEqual(V1_DEFAULT_TRIANGLES);
    const fixture: KrathongAppearance = { base: "banana_trunk_01", lotusFold: "style_01", leafColor: "#5E8C3A", flowers: ["marigold"], candleColor: "#FFD166" };
    expect(countKrathongTriangles(fixture)).toBeLessThanOrEqual(E2E_FIXTURE_MAX_TRIANGLES);
  });

  it("MFW-48: no new shader-program variants", () => {
    for (const material of createKrathongAssets().listMaterials()) {
      expect(material.type).toBe("MeshStandardMaterial");
      expect(material.side).toBe(FrontSide);
      expect(material.flatShading).toBe(false);
      expect(material.vertexColors).toBe(false);
      expect(material.transparent).toBe(false);
    }
  });

  it("MFW-48: the shared flame flicker starts static", () => {
    expect(createKrathongAssets().flameFlicker).toEqual({ heightScale: 1, widthScale: 1, emissiveScale: 1 });
  });

  it("throws on an unknown key", () => {
    const assets = createKrathongAssets();
    expect(() => assets.geometry("nope" as never)).toThrow("unknown krathong asset key");
    expect(() => assets.material("nope" as never)).toThrow("unknown krathong asset key");
  });
});
