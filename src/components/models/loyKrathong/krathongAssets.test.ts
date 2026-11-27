import { FrontSide, MeshStandardMaterial, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { FLOWER_KINDS, KRATHONG_BASE_IDS, LEAF_FOLD_STYLE_IDS, RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import {
  KRATHONG_LODS,
  KRATHONG_MAX_TRIANGLES_BY_LOD,
  KRATHONG_RIVER_LOD_BY_TIER,
  type KrathongLod,
} from "@/config/krathongModel.config";
import { TIER_BUDGETS } from "@/config/performance.config";
import {
  assembleKrathong,
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  meshSpecFor,
  type KrathongAppearance,
} from "@/core/customization";
import { buildKrathongMeshData, countKrathongTriangles } from "@/core/customization/krathongMeshData";
import { KRATHONG_DESIGN_BODY_MATERIAL } from "@/config/krathongDesigns.config";
import { KRATHONG_MATTE_SURFACE } from "@/config/krathongModel.config";
import { parseKrathongDesignGlb, type KrathongDesignMeshData } from "@/core/customization/krathongDesignGlb";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { createKrathongAssets } from "./krathongAssets";
import type { KrathongDesignLoad } from "./krathongDesignLoader";

function designData(): KrathongDesignMeshData {
  const bytes = writeGlb({
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    colors: new Uint8Array(12).fill(200),
    indices: [0, 1, 2],
    flames: [[0, 1, 0, 0.4, 0.1]],
  });
  return parseKrathongDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/** A loader whose promises the test settles. */
function deferredLoader() {
  const pending: { resolve: (d: KrathongDesignMeshData) => void; reject: (e: Error) => void }[] = [];
  const load = vi.fn<KrathongDesignLoad>(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  return { load, pending };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

const countTriangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
/** v1 default krathong at BASE 9c98d1c (MFW-47): 1360 triangles, measured from the primitive geometries. */
const V1_DEFAULT_TRIANGLES = 1360;
/** Lead guards for the e2e fixture E2E_APPEARANCE (banana, style_01, one marigold) per LOD (MFW-69); v1 = 380, v2 = 548. */
const E2E_FIXTURE_MAX_TRIANGLES_BY_LOD: Readonly<Record<KrathongLod, number>> = { full: 1950, medium: 650, low: 520 };
/** Worst-appearance colour-pass river triangles of a full zone at MFW-48 (docs/perf/MFW-48.md §3). */
const MFW48_ZONE_WORST = { MEDIUM: 52_224, LOW: 26_112 } as const;

const worstTriangles = (lod: KrathongLod) => {
  let worst = 0;
  for (const base of KRATHONG_BASE_IDS)
    for (const lotusFold of LEAF_FOLD_STYLE_IDS)
      for (const kind of FLOWER_KINDS)
        worst = Math.max(
          worst,
          countKrathongTriangles({ ...DEFAULT_KRATHONG_APPEARANCE, base, lotusFold, flowers: new Array(RIM_SOCKET_COUNT).fill(kind) }, lod),
        );
  return worst;
};

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
    const distinctSpecs = new Set(KRATHONG_GEOMETRY_KEYS.flatMap((key) => KRATHONG_LODS.map((lod) => meshSpecFor(key, lod))));
    expect(assets.listGeometries()).toHaveLength(distinctSpecs.size);
    expect(assets.listMaterials()).toHaveLength(KRATHONG_MATERIAL_KEYS.length + 1); // + the design-body material (MFW-65)
  });

  it("MFW-69: identical specs share one geometry", () => {
    const assets = createKrathongAssets();
    expect(assets.geometry("incense", "full")).toBe(assets.geometry("incense", "medium"));
    expect(assets.geometry("base:lotus_petal_01", "medium")).toBe(assets.geometry("base:lotus_petal_01", "low"));
    expect(assets.geometry("candle", "full")).not.toBe(assets.geometry("candle", "medium"));
    expect(assets.geometry("candle")).toBe(assets.geometry("candle", "full"));
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

  it("every geometry is the mesh of its (key, LOD) with smooth normals", () => {
    const assets = createKrathongAssets();
    for (const key of KRATHONG_GEOMETRY_KEYS)
      for (const lod of KRATHONG_LODS) {
        const g = assets.geometry(key, lod);
        expect(countTriangles(g), `${key}@${lod}`).toBe(buildKrathongMeshData(meshSpecFor(key, lod)).triangleCount);
        expect(g.getAttribute("normal"), `${key}@${lod}`).toBeDefined();
        expect(g.boundingSphere, `${key}@${lod}`).not.toBeNull();
      }
  });

  it("MFW-69: per-krathong triangles per LOD", () => {
    for (const lod of KRATHONG_LODS) expect(worstTriangles(lod), lod).toBeLessThanOrEqual(KRATHONG_MAX_TRIANGLES_BY_LOD[lod]);
    for (const key of KRATHONG_GEOMETRY_KEYS) {
      const [full, medium, low] = KRATHONG_LODS.map((lod) => buildKrathongMeshData(meshSpecFor(key, lod)).triangleCount);
      expect(full, key).toBeGreaterThanOrEqual(medium);
      expect(medium, key).toBeGreaterThanOrEqual(low);
    }
    expect(countKrathongTriangles(DEFAULT_KRATHONG_APPEARANCE, "medium")).toBeLessThanOrEqual(V1_DEFAULT_TRIANGLES);
    const fixture: KrathongAppearance = { base: "banana_trunk_01", lotusFold: "style_01", leafColor: "#5E8C3A", flowers: ["marigold"], candleColor: "#FFD166" };
    for (const lod of KRATHONG_LODS) {
      expect(countKrathongTriangles(fixture, lod), lod).toBeLessThanOrEqual(E2E_FIXTURE_MAX_TRIANGLES_BY_LOD[lod]);
    }
  });

  it("MFW-69: a full zone per tier stays within MFW-48's river triangles on MEDIUM and LOW", () => {
    for (const tier of ["MEDIUM", "LOW"] as const) {
      const zone = TIER_BUDGETS[tier].riverItemCap * worstTriangles(KRATHONG_RIVER_LOD_BY_TIER[tier]);
      expect(zone, tier).toBeLessThanOrEqual(MFW48_ZONE_WORST[tier]);
    }
  });

  it("MFW-48: no new shader-program variants (MFW-65: except the one design-body vertex-colour variant, D3)", () => {
    const assets = createKrathongAssets();
    expect(assets.listMaterials().filter((m) => m.vertexColors)).toEqual([assets.designMaterial]);
    for (const material of assets.listMaterials().filter((m) => m !== assets.designMaterial)) {
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

  it("KAS1: a design is null until it resolves, then a vertex-coloured geometry with its flames", async () => {
    const { load, pending } = deferredLoader();
    const assets = createKrathongAssets({ loadDesign: load });
    const listener = vi.fn();
    assets.subscribeDesigns(listener);
    assets.requestDesign("banana_leaf_01", "full");
    expect(assets.design("banana_leaf_01", "full")).toBeNull();
    expect(assets.getDesignVersion()).toBe(0);
    const data = designData();
    pending[0].resolve(data);
    await flush();
    const design = assets.design("banana_leaf_01", "full");
    expect(design).not.toBeNull();
    expect(assets.design("banana_leaf_01", "full")).toBe(design);
    const g = design!.geometry;
    expect(g.getAttribute("position").itemSize).toBe(3);
    expect(g.getAttribute("normal").itemSize).toBe(3);
    expect(g.getAttribute("color").itemSize).toBe(4);
    expect(g.getAttribute("color").normalized).toBe(true);
    expect(g.index).not.toBeNull();
    expect(g.boundingSphere).not.toBeNull();
    expect(design!.flames).toEqual(data.flames);
    expect(assets.getDesignVersion()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(assets.listGeometries()).toContain(g);
    assets.dispose();
  });

  it("KAS2: requestDesign is idempotent", () => {
    const { load } = deferredLoader();
    const assets = createKrathongAssets({ loadDesign: load });
    assets.requestDesign("banana_leaf_01", "low");
    assets.requestDesign("banana_leaf_01", "low");
    expect(load).toHaveBeenCalledTimes(1);
    assets.dispose();
    assets.requestDesign("banana_leaf_01", "medium");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("KAS3: dispose frees the design geometry, material and placeholder; a later resolve builds nothing", async () => {
    const { load, pending } = deferredLoader();
    const assets = createKrathongAssets({ loadDesign: load });
    assets.requestDesign("banana_leaf_01", "full");
    assets.requestDesign("banana_leaf_01", "low");
    pending[0].resolve(designData());
    await flush();
    const geometry = assets.design("banana_leaf_01", "full")!.geometry;
    const placeholder = assets.batchGeometry("design:banana_leaf_01", "medium");
    const spies = [vi.spyOn(geometry, "dispose"), vi.spyOn(assets.designMaterial, "dispose"), vi.spyOn(placeholder, "dispose")];
    assets.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    pending[1].resolve(designData());
    await flush();
    expect(assets.design("banana_leaf_01", "low")).toBeNull();
  });

  it("KAS4: the design material and the batch keys", async () => {
    const { load, pending } = deferredLoader();
    const assets = createKrathongAssets({ loadDesign: load });
    const m = assets.designMaterial;
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect(m.vertexColors).toBe(true);
    expect(m.roughness).toBe(KRATHONG_MATTE_SURFACE.roughness);
    expect(m.metalness).toBe(KRATHONG_MATTE_SURFACE.metalness);
    expect(m.color.getHexString()).toBe(KRATHONG_DESIGN_BODY_MATERIAL.color.slice(1).toLowerCase());
    expect(m.map).toBeNull();
    expect(m.side).toBe(FrontSide);
    expect(assets.batchMaterial("designBody")).toBe(m);
    expect(assets.batchMaterial("flame")).toBe(assets.material("flame"));
    expect(assets.batchGeometry("candle", "low")).toBe(assets.geometry("candle", "low"));
    const placeholder = assets.batchGeometry("design:banana_leaf_01", "medium");
    expect(placeholder.getAttribute("position")).toBeUndefined();
    assets.requestDesign("banana_leaf_01", "medium");
    pending[0].resolve(designData());
    await flush();
    expect(assets.batchGeometry("design:banana_leaf_01", "medium")).toBe(assets.design("banana_leaf_01", "medium")!.geometry);
    expect(assets.batchGeometry("design:banana_leaf_01", "low")).toBe(placeholder);
    assets.dispose();
  });
});
