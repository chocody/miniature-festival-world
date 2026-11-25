// @vitest-environment node
import { Group, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DRAG_START_DISTANCE_PX } from "@/config/interaction.config";
import { isTapClick, tapPointInParentSpace } from "./tapPoint";

function setup() {
  const group = new Group();
  group.position.set(1, 0, 2);
  group.rotation.y = Math.PI / 2;
  const mesh = new Mesh();
  mesh.position.set(0, -0.24, 0);
  group.add(mesh);
  group.updateMatrixWorld(true);
  const point = group.localToWorld(new Vector3(0.5, -0.24, -0.3));
  return { group, mesh, point };
}

describe("tapPointInParentSpace", () => {
  it("converts a world point into the parent's space", () => {
    const { mesh, point } = setup();
    const r = tapPointInParentSpace({ point, object: mesh, delta: 0 })!;
    expect(r.x).toBeCloseTo(0.5, 9);
    expect(r.z).toBeCloseTo(-0.3, 9);
  });
  it("gives no point for a drag", () => {
    const { mesh, point } = setup();
    expect(tapPointInParentSpace({ point, object: mesh, delta: DRAG_START_DISTANCE_PX })).not.toBeNull();
    expect(tapPointInParentSpace({ point, object: mesh, delta: DRAG_START_DISTANCE_PX + 1 })).toBeNull();
  });
  it("rejects missing or non-three inputs", () => {
    const { mesh, point } = setup();
    expect(tapPointInParentSpace({ object: mesh })).toBeNull();
    expect(tapPointInParentSpace({ point: { x: 0, y: 0, z: 0 }, object: mesh })).toBeNull();
    expect(tapPointInParentSpace({ point })).toBeNull();
  });
  it("uses the object itself when it has no parent", () => {
    const m = new Mesh();
    m.position.set(2, 0, 3);
    m.updateMatrixWorld(true);
    const r = tapPointInParentSpace({ point: new Vector3(3, 0, 3), object: m })!;
    expect(r.x).toBeCloseTo(1, 9);
    expect(r.z).toBeCloseTo(0, 9);
  });
});

describe("isTapClick", () => {
  it("treats a missing or odd delta as a tap", () => {
    expect(isTapClick({})).toBe(true);
    expect(isTapClick({ delta: "x" })).toBe(true);
    expect(isTapClick({ delta: 9 })).toBe(9 <= DRAG_START_DISTANCE_PX);
  });
});
