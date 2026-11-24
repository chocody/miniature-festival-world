import { MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  assembleKrathong,
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  type KrathongAppearance,
} from "@/core/customization";
import { createKrathongAssets } from "./krathongAssets";

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

  it("throws on an unknown key", () => {
    const assets = createKrathongAssets();
    expect(() => assets.geometry("nope" as never)).toThrow("unknown krathong asset key");
    expect(() => assets.material("nope" as never)).toThrow("unknown krathong asset key");
  });
});
