import { createRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { BufferGeometry, InstancedMesh, Material, Matrix4, Quaternion } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perfSoakAppearance } from "@/components/canvas3d/perfSoak";
import { KRATHONG_RIVER_LOD_BY_TIER } from "@/config/krathongModel.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import {
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_INSTANCE_BUCKET_COUNT,
  KRATHONG_INSTANCE_BUCKETS,
} from "@/core/customization";
import { KrathongAssetsProvider, useKrathongAssets } from "./KrathongAssetsProvider";
import type { KrathongAssets } from "./krathongAssets";
import { RiverKrathongBatch, type RiverKrathongBatchHandle } from "./RiverKrathongBatch";
import { planKrathongInstances } from "./riverKrathongBatch";

const plan = (n: number, offset = 0) => planKrathongInstances(Array.from({ length: n }, (_, k) => perfSoakAppearance(k + offset)));

function ui(ref: React.Ref<RiverKrathongBatchHandle>, p = plan(3), shadows = false, withBatch = true) {
  return <KrathongAssetsProvider>{withBatch ? <RiverKrathongBatch ref={ref} plan={p} shadows={shadows} /> : null}</KrathongAssetsProvider>;
}

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  useDeviceStore.getState().setQualityTier("HIGH");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RiverKrathongBatch", () => {
  it("has one persistent mesh per bucket", () => {
    const ref = createRef<RiverKrathongBatchHandle>();
    const { container } = render(ui(ref));
    expect(ref.current!.meshes).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
    expect(container.querySelector('[name="river-krathong-batch"]')!.querySelectorAll("primitive")).toHaveLength(KRATHONG_INSTANCE_BUCKET_COUNT);
  });

  it("bucket meshes use the shared geometry of the tier LOD", () => {
    let assets: KrathongAssets | null = null;
    function Probe() {
      assets = useKrathongAssets();
      return null;
    }
    const ref = createRef<RiverKrathongBatchHandle>();
    render(
      <KrathongAssetsProvider>
        <Probe />
        <RiverKrathongBatch ref={ref} plan={plan(3)} shadows={false} />
      </KrathongAssetsProvider>,
    );
    expect(assets).not.toBeNull();
    const a = assets as unknown as KrathongAssets;
    expect(ref.current!.meshes).toHaveLength(KRATHONG_INSTANCE_BUCKETS.length);
    ref.current!.meshes.forEach((mesh, i) => {
      // HIGH draws the LOD of KRATHONG_RIVER_LOD_BY_TIER.HIGH (PLACEHOLDER "medium", MFW-69 lead decision).
      expect(mesh.geometry).toBe(a.batchGeometry(KRATHONG_INSTANCE_BUCKETS[i].geometryKey, KRATHONG_RIVER_LOD_BY_TIER.HIGH));
      expect(mesh.material).toBe(a.batchMaterial(KRATHONG_INSTANCE_BUCKETS[i].materialKey));
    });
  });

  it("MFW-69: tier change swaps LOD on the same meshes", () => {
    let assets: KrathongAssets | null = null;
    function Probe() {
      assets = useKrathongAssets();
      return null;
    }
    const ref = createRef<RiverKrathongBatchHandle>();
    render(
      <KrathongAssetsProvider>
        <Probe />
        <RiverKrathongBatch ref={ref} plan={plan(3)} shadows={false} />
      </KrathongAssetsProvider>,
    );
    const a = assets as unknown as KrathongAssets;
    const meshes = ref.current!.meshes;
    const items = [...meshes];
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, "dispose");
    for (const [tier, lod] of [["MEDIUM", "medium"], ["LOW", "low"]] as const) {
      act(() => useDeviceStore.getState().setQualityTier(tier));
      expect(ref.current!.meshes, tier).toBe(meshes);
      meshes.forEach((mesh, i) => {
        expect(mesh, `${tier} ${i}`).toBe(items[i]);
        expect(mesh.geometry, `${tier} ${i}`).toBe(a.batchGeometry(KRATHONG_INSTANCE_BUCKETS[i].geometryKey, lod));
      });
    }
    expect(geometrySpy).toHaveBeenCalledTimes(0);
  });

  it("counts follow the plan", () => {
    const ref = createRef<RiverKrathongBatchHandle>();
    const p = planKrathongInstances([DEFAULT_KRATHONG_APPEARANCE, DEFAULT_KRATHONG_APPEARANCE, DEFAULT_KRATHONG_APPEARANCE]);
    render(ui(ref, p));
    ref.current!.meshes.forEach((mesh, i) => {
      expect(mesh.count).toBe(p.bucketCounts[i]);
      expect(mesh.visible).toBe(p.bucketCounts[i] > 0);
    });
  });

  it("zone switches reuse the meshes", () => {
    const meshSpy = vi.spyOn(InstancedMesh.prototype, "dispose");
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialSpy = vi.spyOn(Material.prototype, "dispose");
    const ref = createRef<RiverKrathongBatchHandle>();
    const view = render(ui(ref, plan(0)));
    const first = ref.current!.meshes;
    const firstItems = [...first];
    for (const n of [80, 1, 80, 0, 80, 1]) {
      view.rerender(ui(ref, plan(n, n)));
      expect(ref.current!.meshes).toBe(first);
      ref.current!.meshes.forEach((m, i) => expect(m).toBe(firstItems[i]));
    }
    expect(meshSpy).toHaveBeenCalledTimes(0);
    expect(geometrySpy).toHaveBeenCalledTimes(0);
    expect(materialSpy).toHaveBeenCalledTimes(0);
  });

  it("unmount disposes the batch, never the shared assets", () => {
    const meshSpy = vi.spyOn(InstancedMesh.prototype, "dispose");
    const geometrySpy = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialSpy = vi.spyOn(Material.prototype, "dispose");
    const ref = createRef<RiverKrathongBatchHandle>();
    const view = render(ui(ref));
    view.rerender(ui(ref, plan(3), false, false));
    expect(meshSpy).toHaveBeenCalledTimes(KRATHONG_INSTANCE_BUCKET_COUNT);
    expect(geometrySpy).toHaveBeenCalledTimes(0);
    expect(materialSpy).toHaveBeenCalledTimes(0);
    let assets: KrathongAssets | null = null;
    function Probe() {
      assets = useKrathongAssets();
      return null;
    }
    view.rerender(
      <KrathongAssetsProvider>
        <Probe />
      </KrathongAssetsProvider>,
    );
    view.unmount();
    // + 1: the empty placeholder geometry of a design bucket not loaded yet (MFW-65), owned by the assets.
    expect(geometrySpy).toHaveBeenCalledTimes((assets as unknown as KrathongAssets).listGeometries().length + 1);
  });

  it("writeItem + commit write the planned slots", () => {
    const ref = createRef<RiverKrathongBatchHandle>();
    const p = planKrathongInstances([DEFAULT_KRATHONG_APPEARANCE]);
    render(ui(ref, p));
    const m = new Matrix4().makeTranslation(1, 2, 3);
    ref.current!.writeItem(0, m, new Quaternion());
    ref.current!.commit();
    const basePart = p.items[0].parts[0];
    const expected = new Matrix4().multiplyMatrices(m, basePart.local);
    const got = ref.current!.meshes[basePart.bucketIndex].getMatrixAt(basePart.slot, new Matrix4());
    for (let e = 0; e < 16; e++) expect(got.elements[e]).toBeCloseTo(expected.elements[e], 5);
  });

  it("shadows prop", () => {
    const ref = createRef<RiverKrathongBatchHandle>();
    const view = render(ui(ref, plan(3), true));
    const meshes = ref.current!.meshes;
    expect(meshes.every((m) => m.castShadow)).toBe(true);
    expect(meshes[0].receiveShadow).toBe(true);
    view.rerender(ui(ref, plan(3), false));
    expect(ref.current!.meshes).toBe(meshes);
    expect(meshes.some((m) => m.castShadow || m.receiveShadow)).toBe(false);
  });
});
