import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BufferGeometry, InstancedMesh, Material } from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong";
import { BLOB_SHADOW_LOOK, KRATHONG_BLOB_SHADOW } from "@/config/look.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { DynamicBlobShadows, EnvironmentBlobShadows, KrathongBlobShadow, type DynamicBlobShadowsHandle } from "./BlobShadows";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

const created = vi.hoisted(() => ({
  meshes: [] as InstancedMesh[],
  geometries: [] as BufferGeometry[],
  materials: [] as Material[],
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
  useFrame: () => {},
}));

vi.mock("./blobShadowMeshes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./blobShadowMeshes")>();
  return {
    ...actual,
    createBlobShadowGeometry: (...args: Parameters<typeof actual.createBlobShadowGeometry>) => {
      const g = actual.createBlobShadowGeometry(...args);
      created.geometries.push(g);
      return g;
    },
    createBlobShadowMaterial: () => {
      const m = actual.createBlobShadowMaterial();
      created.materials.push(m);
      return m;
    },
    createBlobShadowInstances: (...args: Parameters<typeof actual.createBlobShadowInstances>) => {
      const mesh = actual.createBlobShadowInstances(...args);
      created.meshes.push(mesh);
      return mesh;
    },
  };
});

const propCount = layout.houses.length + layout.trees.length + layout.lamps.length;

beforeEach(() => {
  useDeviceStore.setState(useDeviceStore.getInitialState(), true);
  created.meshes.length = 0;
  created.geometries.length = 0;
  created.materials.length = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EnvironmentBlobShadows (AC2)", () => {
  it.each(["HIGH", "MEDIUM", "LOW"] as const)("%s: one instanced blob per house, tree and lamp", (tier) => {
    useDeviceStore.getState().setQualityTier(tier);
    const { container } = render(<EnvironmentBlobShadows layout={layout} />);
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.environmentBlobShadows}"]`)).toHaveLength(1);
    expect(created.meshes).toHaveLength(1);
    expect(created.meshes[0].count).toBe(propCount);
  });

  it("LOW uses the cheap fan", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    render(<EnvironmentBlobShadows layout={layout} />);
    const high = created.geometries.at(-1)!.index!.count;
    cleanup();
    useDeviceStore.getState().setQualityTier("LOW");
    render(<EnvironmentBlobShadows layout={layout} />);
    const low = created.geometries.at(-1)!.index!.count;
    expect(low).toBeLessThan(high);
  });

  it("unmount disposes the geometry and material once each", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { unmount } = render(<EnvironmentBlobShadows layout={layout} />);
    const geometrySpy = vi.spyOn(created.geometries[0], "dispose");
    const materialSpy = vi.spyOn(created.materials[0], "dispose");
    unmount();
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
  });

  it("a tier change disposes the old fan", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const { rerender } = render(<EnvironmentBlobShadows layout={layout} />);
    const spy = vi.spyOn(created.geometries[0], "dispose");
    useDeviceStore.getState().setQualityTier("LOW");
    rerender(<EnvironmentBlobShadows layout={layout} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(created.meshes.at(-1)!.count).toBe(propCount);
  });

  it("reduced motion renders the same output", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const a = render(<EnvironmentBlobShadows layout={layout} />).container.innerHTML;
    cleanup();
    useDeviceStore.getState().setReducedMotion(true);
    const b = render(<EnvironmentBlobShadows layout={layout} />).container.innerHTML;
    expect(b).toBe(a);
  });
});

describe("DynamicBlobShadows", () => {
  it("writes blobs on the surface and commits the count", () => {
    useDeviceStore.getState().setQualityTier("MEDIUM");
    const ref = createRef<DynamicBlobShadowsHandle>();
    render(<DynamicBlobShadows ref={ref} name="dyn" capacity={4} surfaceY={-0.24} radius={0.3} />);
    const mesh = created.meshes[0];
    expect(mesh.count).toBe(0);
    ref.current!.writeAt(0, 1, 2);
    ref.current!.writeAt(1, 3, 4);
    ref.current!.commit(2);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array[12]).toBeCloseTo(1, 6);
    expect(mesh.instanceMatrix.array[13]).toBeCloseTo(-0.24 + BLOB_SHADOW_LOOK.liftY, 6);
    expect(mesh.instanceMatrix.array[14]).toBeCloseTo(2, 6);
  });
});

describe("DynamicBlobShadows hideAt", () => {
  it("collapses a slot to zero scale so no stray blob shows", () => {
    useDeviceStore.getState().setQualityTier("HIGH");
    const ref = createRef<DynamicBlobShadowsHandle>();
    render(<DynamicBlobShadows ref={ref} name="dyn" capacity={2} surfaceY={-0.24} radius={0.3} />);
    ref.current!.writeAt(1, 5, 5);
    ref.current!.hideAt(1);
    ref.current!.commit(2);
    const m = created.meshes[0].instanceMatrix.array;
    expect([m[16], m[21], m[26]]).toEqual([0, 1, 0]);
  });
});

describe("KrathongBlobShadow", () => {
  it("renders one named blob that ignores taps, sized from config", () => {
    useDeviceStore.getState().setQualityTier("LOW");
    const { container } = render(<KrathongBlobShadow />);
    expect(container.querySelectorAll(`[name="${SCENE_OBJECT_NAMES.krathongBlobShadow}"]`)).toHaveLength(1);
    const mesh = created.meshes[0];
    expect(mesh.count).toBe(1);
    expect(mesh.raycast).toBe(NO_RAYCAST);
    const m = mesh.instanceMatrix.array;
    expect(m[0]).toBeCloseTo(KRATHONG_BLOB_SHADOW.radius, 6);
    expect(m[10]).toBeCloseTo(KRATHONG_BLOB_SHADOW.radius, 6);
    expect(m[13]).toBeCloseTo(KRATHONG_BLOB_SHADOW.liftY, 6);
  });
});
