import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, BufferGeometry, InstancedMesh, Material, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";
import { InstancedPart } from "./InstancedPart";
import { applyInstanceTransforms, composeInstanceMatrix, partShadowProps } from "./instancing";

const createdMaterials = vi.hoisted(() => [] as import("three").MeshStandardMaterial[]);
vi.mock("./geometry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./geometry")>();
  return {
    ...actual,
    createInstancedPartMaterial: (spec: Parameters<typeof actual.createInstancedPartMaterial>[0]) => {
      const m = actual.createInstancedPartMaterial(spec);
      createdMaterials.push(m);
      return m;
    },
  };
});

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: () => {} }),
}));

const PART: ScenePartSpec = {
  geometry: { kind: "box", width: 1, height: 1, depth: 1 },
  material: { color: "#445566", roughness: 1, metalness: 0, flatShading: true },
  yOffset: 0.5,
  yawOffsetRad: 0,
  castShadow: true,
  receiveShadow: true,
};
const T0: InstanceTransform = { position: { x: 1, y: 2, z: 3 }, yawRad: Math.PI / 2, scale: 2 };
const T1: InstanceTransform = { position: { x: -1, y: 0, z: 4 }, yawRad: 0, scale: 1 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("instancing helpers", () => {
  it("composes position, yaw and scale", () => {
    const m = composeInstanceMatrix(T0, { yOffset: 0.5, yawOffsetRad: 0 }, new Matrix4());
    const p = new Vector3();
    const s = new Vector3();
    m.decompose(p, new Quaternion(), s);
    expect([p.x, p.y, p.z]).toEqual([1, 3, 3].map((n) => expect.closeTo(n, 6)));
    expect([s.x, s.y, s.z]).toEqual([2, 2, 2].map((n) => expect.closeTo(n, 6)));
    const v = new Vector3(0, 0, 1).applyMatrix4(m);
    expect([v.x, v.y, v.z]).toEqual([3, 3, 3].map((n) => expect.closeTo(n, 6)));
  });

  it("writes every instance matrix", () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 2);
    applyInstanceTransforms(mesh, [T0, T1], PART);
    const got = new Matrix4();
    mesh.getMatrixAt(1, got);
    expect(got.equals(composeInstanceMatrix(T1, PART, new Matrix4()))).toBe(true);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    expect(mesh.boundingSphere).not.toBeNull();
  });

  it("gates shadows by tier", () => {
    expect(partShadowProps(PART, false)).toEqual({ castShadow: false, receiveShadow: false });
    expect(partShadowProps(PART, true)).toEqual({ castShadow: true, receiveShadow: true });
  });
});

describe("InstancedPart", () => {
  it("renders one instanced mesh, or nothing without transforms", () => {
    const one = render(<InstancedPart name="x" part={PART} transforms={[T0, T1]} shadows={false} />);
    expect(one.container.querySelectorAll('instancedMesh[name="x"]')).toHaveLength(1);
    one.unmount();
    const none = render(<InstancedPart name="x" part={PART} transforms={[]} shadows={false} />);
    expect(none.container.querySelector("instancedMesh")).toBeNull();
  });

  it("exposes the drawn mesh through meshRef (MFW-70)", () => {
    const ref = createRef<InstancedMesh>();
    render(<InstancedPart name="x" part={PART} transforms={[T0, T1]} shadows={false} meshRef={ref} />);
    expect(ref.current).not.toBeNull();
    expect((ref.current as unknown as Element).getAttribute("name")).toBe("x");
  });

  it("disposes only on unmount, never on re-render", () => {
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const transforms = [T0, T1];
    const view = render(<InstancedPart name="x" part={PART} transforms={transforms} shadows={false} />);
    view.rerender(<InstancedPart name="x" part={PART} transforms={transforms} shadows={false} />);
    view.rerender(<InstancedPart name="x" part={PART} transforms={transforms} shadows />);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    view.unmount();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("MFW-77: a geometry-only swap disposes only the old geometry; unmount disposes both", () => {
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    createdMaterials.length = 0;
    const transforms = [T0, T1];
    const lite: ScenePartSpec = { ...PART, geometry: { kind: "box", width: 0.5, height: 0.5, depth: 0.5 } }; // same material spec object
    const view = render(<InstancedPart name="x" part={PART} transforms={transforms} shadows={false} />);
    view.rerender(<InstancedPart name="x" part={lite} transforms={transforms} shadows={false} />);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(createdMaterials).toHaveLength(1);
    view.unmount();
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("applies and updates the emissiveIntensity prop without re-creating the material (MFW-49)", () => {
    const glowing: ScenePartSpec = { ...PART, material: { ...PART.material, emissive: "#ffc46b", emissiveIntensity: 0.9 } };
    createdMaterials.length = 0;
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const transforms = [T0];
    const view = render(<InstancedPart name="x" part={glowing} transforms={transforms} shadows={false} emissiveIntensity={0} />);
    expect(createdMaterials).toHaveLength(1);
    const material = createdMaterials[0];
    expect(material.emissiveIntensity).toBe(0);
    view.rerender(<InstancedPart name="x" part={glowing} transforms={transforms} shadows={false} emissiveIntensity={1.2} />);
    expect(createdMaterials).toHaveLength(1);
    expect(material.emissiveIntensity).toBe(1.2);
    expect(materialDispose).not.toHaveBeenCalled();
    view.rerender(<InstancedPart name="x" part={glowing} transforms={transforms} shadows={false} />);
    expect(material.emissiveIntensity).toBe(1.2); // undefined leaves the current value
  });
});
