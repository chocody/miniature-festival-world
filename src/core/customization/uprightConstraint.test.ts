import { Euler, Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { computeUprightLocalQuaternion, writeYawTwistQuaternion } from "./uprightConstraint";

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

describe("writeYawTwistQuaternion", () => {
  const Y_AXIS = new Vector3(0, 1, 0);
  it("returns a pure yaw unchanged", () => {
    const q = new Quaternion().setFromAxisAngle(Y_AXIS, 1.2);
    const out = writeYawTwistQuaternion(q, new Quaternion());
    for (const k of ["x", "y", "z", "w"] as const) expect(out[k]).toBeCloseTo(q[k], 12);
  });
  it("drops tilt, stays unit length and keeps up", () => {
    const q = new Quaternion().setFromEuler(new Euler(0.05, 0.7, 0.04, "YXZ"));
    const out = writeYawTwistQuaternion(q, new Quaternion());
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
    expect(out.length()).toBeCloseTo(1, 12);
    const up = Y_AXIS.clone().applyQuaternion(out);
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeCloseTo(1, 12);
    expect(up.z).toBeCloseTo(0, 12);
  });
  it("gives identity for a 180 degree tilt about X", () => {
    const out = writeYawTwistQuaternion(new Quaternion(1, 0, 0, 0), new Quaternion(0.3, 0.3, 0.3, 0.3));
    expect(out.toArray()).toEqual([0, 0, 0, 1]);
  });
  it("allows out to alias source", () => {
    const q = new Quaternion().setFromEuler(new Euler(0.2, 0.9, -0.1, "YXZ"));
    const fresh = writeYawTwistQuaternion(q, new Quaternion());
    writeYawTwistQuaternion(q, q);
    expect(q.equals(fresh)).toBe(true);
  });
});
