import { Euler, Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { computeUprightLocalQuaternion } from "./uprightConstraint";

function upOf(child: Group): Vector3 {
  return new Vector3(0, 1, 0).applyQuaternion(child.getWorldQuaternion(new Quaternion()));
}
function constrain(parent: Group, child: Group) {
  parent.updateMatrixWorld(true);
  computeUprightLocalQuaternion(parent.getWorldQuaternion(new Quaternion()), child.quaternion);
  child.updateMatrixWorld(true);
}

describe("computeUprightLocalQuaternion", () => {
  it.each([
    [0, 0, 0],
    [0, 1.2, 0],
    [0.4, 1.1, -0.3],
    [-0.7, 0, 0.5],
    [Math.PI, 0, 0],
  ])("keeps world up for parent rotation %j", (x, y, z) => {
    const parent = new Group();
    const child = new Group();
    parent.add(child);
    parent.rotation.copy(new Euler(x, y, z));
    constrain(parent, child);
    const up = upOf(child);
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(1, 9);
    expect(up.z).toBeCloseTo(0, 9);
  });

  it("is identity for a pure-yaw parent", () => {
    const parent = new Group();
    const child = new Group();
    parent.add(child);
    parent.rotation.set(0, 1.2, 0);
    constrain(parent, child);
    expect(child.quaternion.x).toBeCloseTo(0, 9);
    expect(child.quaternion.y).toBeCloseTo(0, 9);
    expect(child.quaternion.z).toBeCloseTo(0, 9);
    expect(Math.abs(child.quaternion.w)).toBeCloseTo(1, 9);
  });

  it("works through a tilted grandparent and yawed parent", () => {
    const grand = new Group();
    const parent = new Group();
    const child = new Group();
    grand.add(parent);
    parent.add(child);
    grand.rotation.set(0.5, 0, -0.4);
    parent.rotation.set(0, 0.9, 0);
    grand.updateMatrixWorld(true);
    computeUprightLocalQuaternion(parent.getWorldQuaternion(new Quaternion()), child.quaternion);
    child.updateMatrixWorld(true);
    const up = upOf(child);
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(1, 9);
    expect(up.z).toBeCloseTo(0, 9);
  });

  it("returns out", () => {
    const out = new Quaternion();
    expect(computeUprightLocalQuaternion(new Quaternion(), out)).toBe(out);
  });
});
