import { createRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { BufferGeometry, InstancedMesh, Material, Matrix4, Quaternion } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { perfSoakAppearance } from "@/components/canvas3d/perfSoak";
import { DEFAULT_KRATHONG_APPEARANCE, KRATHONG_GEOMETRY_KEYS, KRATHONG_INSTANCE_BUCKET_COUNT } from "@/core/customization";
import { KrathongAssetsProvider } from "./KrathongAssetsProvider";
import { RiverKrathongBatch, type RiverKrathongBatchHandle } from "./RiverKrathongBatch";
import { planKrathongInstances } from "./riverKrathongBatch";

const plan = (n: number, offset = 0) => planKrathongInstances(Array.from({ length: n }, (_, k) => perfSoakAppearance(k + offset)));

function ui(ref: React.Ref<RiverKrathongBatchHandle>, p = plan(3), shadows = false, withBatch = true) {
  return <KrathongAssetsProvider>{withBatch ? <RiverKrathongBatch ref={ref} plan={p} shadows={shadows} /> : null}</KrathongAssetsProvider>;
}

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
    view.unmount();
    expect(geometrySpy).toHaveBeenCalledTimes(KRATHONG_GEOMETRY_KEYS.length);
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
