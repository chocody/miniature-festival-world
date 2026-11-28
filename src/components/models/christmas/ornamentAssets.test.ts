import { describe, expect, it, vi } from "vitest";
import { ORNAMENT_DESIGN_IDS, type OrnamentDesignId } from "@/config/ornamentDesigns.config";
import { ORNAMENT_MODEL_RADIUS } from "@/config/ornamentModels.config";
import { parseOrnamentDesignGlb, type OrnamentDesignMeshData } from "@/core/customization/ornamentDesignGlb";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { createOrnamentAssets } from "./ornamentAssets";
import type { OrnamentDesignLoad } from "./ornamentDesignLoader";

/** A design id with no glb source. */
const NO_SOURCE = "nope_01" as OrnamentDesignId;

function designData(): OrnamentDesignMeshData {
  const bytes = writeGlb(
    {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Uint8Array(12).fill(200),
      indices: [0, 1, 2],
    },
    { extras: { ornamentHook: [0, 0.9, 0] } },
  );
  return parseOrnamentDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/** A loader whose promises the test settles by hand. */
function deferredLoader() {
  const pending: { resolve: (d: OrnamentDesignMeshData) => void; reject: (e: Error) => void }[] = [];
  const load = vi.fn<OrnamentDesignLoad>(
    () =>
      new Promise<OrnamentDesignMeshData>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  return { load, pending };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe("ornament assets (MFW-101)", () => {
  it("OA1: a design appears once its load resolves; same object every call; version and listeners", async () => {
    const { load, pending } = deferredLoader();
    const assets = createOrnamentAssets({ loadDesign: load });
    const listener = vi.fn();
    assets.subscribeDesigns(listener);
    assets.requestDesign("ball_01", "full");
    expect(assets.design("ball_01", "full")).toBeNull();
    expect(assets.getDesignVersion()).toBe(0);
    const data = designData();
    pending[0].resolve(data);
    await flush();
    const asset = assets.design("ball_01", "full");
    expect(asset).not.toBeNull();
    expect(asset?.design).toBe("ball_01");
    expect(asset?.lod).toBe("full");
    const color = asset?.geometry.getAttribute("color");
    expect(color?.itemSize).toBe(4);
    expect(color?.normalized).toBe(true);
    expect(asset?.geometry.getAttribute("position").array).toBe(data.positions);
    expect(asset?.geometry.index).not.toBeNull();
    expect(asset?.hook).toEqual({ x: 0, y: 0.9, z: 0 });
    expect(assets.design("ball_01", "full")).toBe(asset);
    expect(assets.getDesignVersion()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    assets.dispose();
  });

  it("OA2: requests are idempotent; a design without a glb source never loads", () => {
    const { load } = deferredLoader();
    const assets = createOrnamentAssets({ loadDesign: load });
    assets.requestDesign("star_01", "medium");
    assets.requestDesign("star_01", "medium");
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("star_01", "medium");
    assets.requestDesign(NO_SOURCE, "medium");
    expect(load).toHaveBeenCalledTimes(1);
    assets.dispose();
  });

  it("OA3: the fallback sphere and its tinted matte materials", () => {
    const assets = createOrnamentAssets({ loadDesign: deferredLoader().load });
    const sphere = assets.fallbackGeometry;
    expect(assets.fallbackGeometry).toBe(sphere);
    expect((sphere.index?.count ?? 0) / 3).toBe(80);
    expect(Math.abs((sphere.boundingSphere?.radius ?? NaN) - ORNAMENT_MODEL_RADIUS)).toBeLessThanOrEqual(1e-6);
    const star = assets.fallbackMaterial("star_01");
    expect(star.color.getHexString()).toBe("d1b271");
    expect(assets.fallbackMaterial(NO_SOURCE)).toBe(assets.fallbackMaterial("ball_01"));
    expect(star.vertexColors).toBe(false);
    expect(star.roughness).toBe(1);
    expect(star.metalness).toBe(0);
    assets.dispose();
  });

  it("OA4: the design material is the shared matte vertex-colour material", () => {
    const assets = createOrnamentAssets({ loadDesign: deferredLoader().load });
    const m = assets.designMaterial;
    expect(m.vertexColors).toBe(true);
    expect(m.color.getHexString()).toBe("ffffff");
    expect(m.roughness).toBe(1);
    expect(m.metalness).toBe(0);
    const materials = assets.listMaterials();
    expect(materials).toContain(m);
    for (const id of ORNAMENT_DESIGN_IDS) expect(materials).toContain(assets.fallbackMaterial(id));
    assets.dispose();
  });

  it("OA5: dispose frees everything once; a late load builds nothing", async () => {
    const { load, pending } = deferredLoader();
    const assets = createOrnamentAssets({ loadDesign: load });
    assets.requestDesign("ball_01", "low");
    pending[0].resolve(designData());
    await flush();
    assets.requestDesign("bow_01", "low");
    const spies = [...assets.listGeometries(), ...assets.listMaterials()].map((o) => vi.spyOn(o, "dispose"));
    expect(spies.length).toBeGreaterThanOrEqual(2 + 1 + 3);
    assets.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    assets.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    pending[1].resolve(designData());
    await flush();
    expect(assets.design("bow_01", "low")).toBeNull();
    assets.requestDesign("star_01", "low");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("OA6: at most two material program variants", () => {
    const assets = createOrnamentAssets({ loadDesign: deferredLoader().load });
    const variants = new Set(assets.listMaterials().map((m) => `${m.type}/${m.vertexColors}`));
    expect(variants.size).toBeLessThanOrEqual(2);
    assets.dispose();
  });
});
