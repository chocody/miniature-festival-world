import { act, cleanup, render } from "@testing-library/react";
import { BufferGeometry, Matrix4, MeshStandardMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOrnamentDesignGlb, type OrnamentDesignMeshData } from "@/core/customization/ornamentDesignGlb";
import { useDeviceStore } from "@/store/useDeviceStore";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { createOrnamentAssets, type OrnamentAssets } from "./ornamentAssets";
import { OrnamentAssetsProvider, useOrnamentAssets } from "./OrnamentAssetsProvider";
import type { OrnamentDesignLoad } from "./ornamentDesignLoader";
import { createOrnamentHeroMesh, ORNAMENT_DESIGN_USERDATA_KEY, OrnamentModel, selectOrnamentHeroSource } from "./OrnamentModel";

const r3f = vi.hoisted(() => ({ frames: [] as (() => void)[] }));
vi.mock("@react-three/fiber", () => ({
  useFrame: (cb: () => void) => {
    r3f.frames.push(cb);
  },
}));

afterEach(() => {
  cleanup();
  r3f.frames.length = 0;
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
});

function designData(): OrnamentDesignMeshData {
  const bytes = writeGlb(
    {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      colors: new Uint8Array(12).fill(200),
      indices: [0, 1, 2],
    },
    { extras: { ornamentHook: [0, 1, 0] } },
  );
  return parseOrnamentDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const count = (c: HTMLElement, selector: string) => c.querySelectorAll(selector).length;
const BODY = 'primitive[name="ornament-design-body"]';
const FALLBACK = 'primitive[name="ornament-fallback"]';

describe("OrnamentModel (MFW-101)", () => {
  it("OM1: before profiling, the fallback sphere renders and nothing loads", () => {
    const load = vi.fn<OrnamentDesignLoad>(() => Promise.resolve(designData()));
    const { container } = render(
      <OrnamentAssetsProvider loadDesign={load}>
        <OrnamentModel design="ball_01" />
      </OrnamentAssetsProvider>,
    );
    expect(count(container, FALLBACK)).toBe(1);
    expect(count(container, BODY)).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("OM2: once profiled and loaded, the design body replaces the fallback", async () => {
    useDeviceStore.setState({ profiled: true });
    const load = vi.fn<OrnamentDesignLoad>(() => Promise.resolve(designData()));
    const { container } = render(
      <OrnamentAssetsProvider loadDesign={load}>
        <OrnamentModel design="bow_01" />
      </OrnamentAssetsProvider>,
    );
    await flush();
    expect(load).toHaveBeenCalledWith("bow_01", "full");
    expect(count(container, BODY)).toBe(1);
    expect(count(container, FALLBACK)).toBe(0);
  });

  it("OM3: a failed load keeps the fallback", async () => {
    useDeviceStore.setState({ profiled: true });
    const load = vi.fn<OrnamentDesignLoad>(() => Promise.reject(new Error("HTTP 404")));
    const { container } = render(
      <OrnamentAssetsProvider loadDesign={load}>
        <OrnamentModel design="star_01" />
      </OrnamentAssetsProvider>,
    );
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(count(container, FALLBACK)).toBe(1);
    expect(count(container, BODY)).toBe(0);
  });

  it("OM4: unmounting the provider disposes the assets", () => {
    let assets: OrnamentAssets | null = null;
    function Grab() {
      assets = useOrnamentAssets();
      return null;
    }
    const { unmount } = render(
      <OrnamentAssetsProvider loadDesign={() => new Promise(() => {})}>
        <Grab />
        <OrnamentModel design="ball_01" />
      </OrnamentAssetsProvider>,
    );
    expect(assets).not.toBeNull();
    const spy = vi.spyOn(assets as unknown as OrnamentAssets, "dispose");
    unmount();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("OM5: static under reduced motion — no frame callback, same element", () => {
    const renderWith = (reducedMotion: boolean) => {
      useDeviceStore.setState({ reducedMotion });
      const { container, unmount } = render(
        <OrnamentAssetsProvider loadDesign={() => new Promise(() => {})}>
          <OrnamentModel design="ball_01" />
        </OrnamentAssetsProvider>,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    };
    const reduced = renderWith(true);
    expect(r3f.frames).toHaveLength(0);
    const full = renderWith(false);
    expect(r3f.frames).toHaveLength(0);
    expect(reduced).toBe(full);
  });

  it("OM6: hero source selection and the 1-instance hero mesh", async () => {
    const assets = createOrnamentAssets({ loadDesign: () => Promise.resolve(designData()) });
    const fallback = selectOrnamentHeroSource(assets, "star_01", null);
    expect(fallback).toEqual({ kind: "fallback", geometry: assets.fallbackGeometry, material: assets.fallbackMaterial("star_01") });
    assets.requestDesign("star_01", "full");
    await new Promise<void>((r) => setTimeout(r, 0));
    const asset = assets.design("star_01", "full");
    expect(asset).not.toBeNull();
    const glb = selectOrnamentHeroSource(assets, "star_01", asset);
    expect(glb.kind).toBe("glb");
    expect(glb.geometry).toBe(asset?.geometry);
    expect(glb.material).toBe(assets.designMaterial);

    const geometry = new BufferGeometry();
    const material = new MeshStandardMaterial();
    const mesh = createOrnamentHeroMesh(geometry, material, "bow_01", "ornament-design-body");
    expect(mesh.count).toBe(1);
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    expect(m.equals(new Matrix4())).toBe(true);
    expect(mesh.userData[ORNAMENT_DESIGN_USERDATA_KEY]).toBe("bow_01");
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mesh.name).toBe("ornament-design-body");
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    mesh.dispose();
    geometry.dispose();
    material.dispose();
    assets.dispose();
  });
});
