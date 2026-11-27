import { act, cleanup, render } from "@testing-library/react";
import { Profiler } from "react";
import { BufferGeometry, MeshStandardMaterial, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIM_SOCKET_COUNT } from "@/config/events/loyKrathong.config";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";
import { KRATHONG_HERO_LOD, KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import { DEFAULT_KRATHONG_APPEARANCE, designFlameParts } from "@/core/customization";
import { writeFlameFlickerAt } from "@/core/customization/flameFlicker";
import { parseKrathongDesignGlb, type KrathongDesignMeshData } from "@/core/customization/krathongDesignGlb";
import { useDeviceStore } from "@/store/useDeviceStore";
import { writeGlb } from "../../../../scripts/krathong-models-lib.mjs";
import { DesignKrathongModel } from "./DesignKrathongModel";
import { KrathongAssetsProvider, useKrathongAssets } from "./KrathongAssetsProvider";
import type { KrathongAssets } from "./krathongAssets";
import type { KrathongDesignLoad } from "./krathongDesignLoader";
import { KrathongModel } from "./KrathongModel";
import { createDesignHeroMesh, KRATHONG_DESIGN_USERDATA_KEY } from "./designHeroMesh";

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

/** Two flames, so the hero renders one procedural flame per anchor (MFW-65). */
function designData(): KrathongDesignMeshData {
  const bytes = writeGlb({
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    colors: new Uint8Array(12).fill(200),
    indices: [0, 1, 2],
    flames: [
      [0, 1, 0, 0.4, 0.12],
      [0.3, 0.8, 0.1, 0.2, 0.06],
    ],
  });
  return parseKrathongDesignGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const count = (c: HTMLElement, selector: string) => c.querySelectorAll(selector).length;

describe("KrathongModel", () => {
  it("renders every part, with candle parts inside the center_socket anchor", () => {
    const { container } = render(
      <KrathongAssetsProvider>
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    expect(count(container, '[name="krathong-model"]')).toBe(1);
    expect(count(container, 'mesh[name="base"]')).toBe(1);
    expect(count(container, 'mesh[name^="leaf_"]')).toBe(KRATHONG_LEAF_COUNT);
    expect(count(container, 'mesh[name^="flower_"]')).toBe(RIM_SOCKET_COUNT);
    expect(count(container, 'mesh[name^="flowerCentre_"]')).toBe(RIM_SOCKET_COUNT); // MFW-48
    expect(count(container, '[name="center_socket"] mesh[name="candle"]')).toBe(1);
    expect(count(container, '[name="center_socket"] mesh[name="flame"]')).toBe(1);
    expect(count(container, '[name="center_socket"] mesh[name^="incense_"]')).toBe(KRATHONG_INCENSE_MODEL.count);
    expect(count(container, 'mesh[name="candle"]')).toBe(1);
  });

  it("renders only the chosen flowers", () => {
    const { container } = render(
      <KrathongAssetsProvider>
        <KrathongModel appearance={{ ...DEFAULT_KRATHONG_APPEARANCE, flowers: ["orchid", null, "lotus"] }} shadows={false} />
      </KrathongAssetsProvider>,
    );
    const names = [...container.querySelectorAll('mesh[name^="flower_"]')].map((m) => m.getAttribute("name"));
    expect(names).toEqual(["flower_rim_socket_0", "flower_rim_socket_2"]);
    const centres = [...container.querySelectorAll('mesh[name^="flowerCentre_"]')].map((m) => m.getAttribute("name"));
    expect(centres).toEqual(["flowerCentre_rim_socket_0", "flowerCentre_rim_socket_2"]);
  });

  it("throws without the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />),
    ).toThrow("useKrathongAssets must be used inside <KrathongAssetsProvider>");
    spy.mockRestore();
  });

  it("shares one assets object per provider and disposes it on unmount", () => {
    const seen: KrathongAssets[] = [];
    function Probe() {
      seen.push(useKrathongAssets());
      return null;
    }
    const { unmount } = render(
      <KrathongAssetsProvider>
        <Probe />
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    const assets = seen[0];
    expect(seen.every((s) => s === assets)).toBe(true);
    const spies = [...assets.listGeometries(), ...assets.listMaterials()].map((o) => vi.spyOn(o, "dispose"));
    unmount();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("KM1: before the tier is decided the procedural model renders and no design is requested", () => {
    const loadDesign = vi.fn<KrathongDesignLoad>(() => Promise.resolve(designData()));
    const { container } = render(
      <KrathongAssetsProvider loadDesign={loadDesign}>
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    expect(count(container, 'mesh[name="candle"]')).toBe(1);
    expect(count(container, 'primitive[name="krathong-design-body"]')).toBe(0);
    expect(loadDesign).not.toHaveBeenCalled();
  });

  it("KM2: once profiled and loaded, the design body and one procedural flame per anchor replace the parts", async () => {
    useDeviceStore.setState({ profiled: true });
    const data = designData();
    const loadDesign = vi.fn<KrathongDesignLoad>(() => Promise.resolve(data));
    const { container } = render(
      <KrathongAssetsProvider loadDesign={loadDesign}>
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    await flush();
    expect(loadDesign).toHaveBeenCalledWith("banana_leaf_01", "full");
    expect(count(container, '[name="krathong-model"]')).toBe(1);
    expect(count(container, 'primitive[name="krathong-design-body"]')).toBe(1);
    expect(count(container, 'mesh[name^="design-flame-"]')).toBe(data.flames.length);
    expect(count(container, 'mesh[name="candle"]')).toBe(0);
  });

  it("KM3: a failed load keeps the procedural model", async () => {
    useDeviceStore.setState({ profiled: true });
    const loadDesign = vi.fn<KrathongDesignLoad>(() => Promise.reject(new Error("HTTP 404")));
    const { container } = render(
      <KrathongAssetsProvider loadDesign={loadDesign}>
        <KrathongModel appearance={DEFAULT_KRATHONG_APPEARANCE} shadows={false} />
      </KrathongAssetsProvider>,
    );
    await flush();
    expect(loadDesign).toHaveBeenCalledTimes(1);
    expect(count(container, 'mesh[name="candle"]')).toBe(1);
    expect(count(container, 'primitive[name="krathong-design-body"]')).toBe(0);
  });

  it("KM4: one frame callback scales every design flame by the shared flicker; static under reduced motion", () => {
    const data = designData();
    let assets: KrathongAssets | null = null;
    function Probe() {
      assets = useKrathongAssets();
      return null;
    }
    let commits = 0;
    const { container } = render(
      <KrathongAssetsProvider>
        <Probe />
        <Profiler id="design" onRender={() => (commits += 1)}>
          <DesignKrathongModel
            asset={{ design: "banana_leaf_01", geometry: new BufferGeometry(), flames: data.flames }}
            shadows={false}
          />
        </Profiler>
      </KrathongAssetsProvider>,
    );
    expect(r3f.frames).toHaveLength(commits); // exactly one useFrame per render of DesignKrathongModel
    const a = assets as unknown as KrathongAssets;
    const parts = designFlameParts(data.flames);
    const flames = [...container.querySelectorAll('mesh[name^="design-flame-"]')] as unknown as { scale: Vector3 }[];
    expect(flames).toHaveLength(parts.length);
    for (const f of flames) f.scale = new Vector3();
    const frame = r3f.frames[r3f.frames.length - 1];
    a.flameFlicker.heightScale = 1.08;
    a.flameFlicker.widthScale = 0.96;
    frame();
    flames.forEach((f, i) => {
      expect(f.scale.x).toBeCloseTo(parts[i].scale[0] * 0.96, 10);
      expect(f.scale.y).toBeCloseTo(parts[i].scale[1] * 1.08, 10);
      expect(f.scale.z).toBeCloseTo(parts[i].scale[2] * 0.96, 10);
    });
    writeFlameFlickerAt(0, true, a.flameFlicker);
    frame();
    flames.forEach((f, i) => expect([f.scale.x, f.scale.y, f.scale.z]).toEqual([...parts[i].scale]));
  });

  describe("design picker (MFW-78)", () => {
    const BODY = '[name="krathong-design-body"]';

    it("MFW-78 KM1: the hero loads and draws the chosen design", async () => {
      useDeviceStore.setState({ profiled: true });
      const loadDesign = vi.fn<KrathongDesignLoad>(() => Promise.resolve(designData()));
      const { container } = render(
        <KrathongAssetsProvider loadDesign={loadDesign}>
          <KrathongModel appearance={{ ...DEFAULT_KRATHONG_APPEARANCE, design: "marigold_01" }} shadows={false} />
        </KrathongAssetsProvider>,
      );
      await flush();
      expect(loadDesign).toHaveBeenCalledWith("marigold_01", KRATHONG_HERO_LOD);
      expect(count(container, BODY)).toBe(1);
    });

    it("MFW-78 KM2: switching design keeps the last design body while the new file loads (no procedural flash)", async () => {
      useDeviceStore.setState({ profiled: true });
      let resolveLotus: (data: KrathongDesignMeshData) => void = () => {};
      const lotus = new Promise<KrathongDesignMeshData>((resolve) => {
        resolveLotus = resolve;
      });
      const loadDesign = vi.fn<KrathongDesignLoad>((design: KrathongDesignId) =>
        design === "lotus_bud_01" ? lotus : Promise.resolve(designData()),
      );
      const ui = (design: KrathongDesignId) => (
        <KrathongAssetsProvider loadDesign={loadDesign}>
          <KrathongModel appearance={{ ...DEFAULT_KRATHONG_APPEARANCE, design }} shadows={false} />
        </KrathongAssetsProvider>
      );
      const { container, rerender } = render(ui("banana_leaf_01"));
      await flush();
      expect(count(container, BODY)).toBe(1);
      rerender(ui("lotus_bud_01"));
      await flush();
      expect(loadDesign).toHaveBeenCalledWith("lotus_bud_01", KRATHONG_HERO_LOD);
      expect(count(container, BODY)).toBe(1);
      expect(count(container, 'mesh[name="candle"]')).toBe(0);
      resolveLotus(designData());
      await flush();
      expect(count(container, BODY)).toBe(1);
      expect(count(container, 'mesh[name="candle"]')).toBe(0);
    });

    it("MFW-78 KM3: the hero mesh records its design in userData", () => {
      const geometry = new BufferGeometry();
      const material = new MeshStandardMaterial();
      const mesh = createDesignHeroMesh(geometry, material, "naga_01");
      expect(mesh.userData[KRATHONG_DESIGN_USERDATA_KEY]).toBe("naga_01");
      expect(mesh.userData.krathongDesign).toBe("naga_01");
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    });
  });
});
