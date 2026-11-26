// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from "three";
import type { FoliageInstance, FoliageSwayParams } from "@/core/world";
import { createFoliageSwayScratch, writeFoliageSway } from "./foliageSway";
import { composeInstanceMatrix } from "./instancing";

/** instanceMatrix stores Float32: matrices compare to 6 digits (float32 epsilon × the coordinates used here). */
const PART = { yOffset: 0.5, yawOffsetRad: 0 };
const SWAY: FoliageSwayParams = { shear: 0.1, periodMs: 1000, windDirX: 0.6, windDirZ: 0.8 };
const INSTANCES: FoliageInstance[] = [
  { position: { x: 1, y: 1, z: 2 }, yawRad: 0.4, scale: 1, swayPivotY: 1, swayPhaseRad: 0 },
  { position: { x: -2, y: 1, z: 0 }, yawRad: 1.1, scale: 2, swayPivotY: 1, swayPhaseRad: 0 },
];
const mesh = () => new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), INSTANCES.length);
const matrixAt = (m: InstancedMesh, i: number) => {
  const out = new Matrix4();
  m.getMatrixAt(i, out);
  return out;
};
const staticMatrix = (i: number) => composeInstanceMatrix(INSTANCES[i], PART, new Matrix4()).clone();
/** World point of the local point that the static matrix maps to world height `worldY`. */
function displacement(m: InstancedMesh, i: number, worldY: number): Vector3 {
  const s = staticMatrix(i);
  const local = new Vector3(0.1, 0, -0.2).applyMatrix4(s);
  const localY = (worldY - local.y) / INSTANCES[i].scale; // the static matrix only scales and lifts y
  const p = new Vector3(0.1, localY, -0.2);
  return p.clone().applyMatrix4(matrixAt(m, i)).sub(p.clone().applyMatrix4(s));
}

describe("writeFoliageSway (MFW-70 AC4)", () => {
  it("S1: at t = 0 every matrix is the rest pose", () => {
    const m = mesh();
    writeFoliageSway(m, INSTANCES, PART, 0, SWAY, createFoliageSwayScratch());
    for (let i = 0; i < INSTANCES.length; i++) {
      const a = matrixAt(m, i).elements;
      const b = staticMatrix(i).elements;
      a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 6));
    }
  });

  it("S2: at the peak a point 2 above the pivot moves 2·k along the wind; the pivot height stays put", () => {
    const m = mesh();
    writeFoliageSway(m, INSTANCES, PART, 250, SWAY, createFoliageSwayScratch()); // k = 0.1
    const top = displacement(m, 0, INSTANCES[0].swayPivotY + 2);
    expect(top.x).toBeCloseTo(0.6 * 0.1 * 2, 6);
    expect(top.y).toBeCloseTo(0, 6);
    expect(top.z).toBeCloseTo(0.8 * 0.1 * 2, 6);
    const pivot = displacement(m, 0, INSTANCES[0].swayPivotY);
    expect(pivot.length()).toBeLessThan(1e-6);
  });

  it("S3: flags the instance matrix upload on every call", () => {
    const m = mesh();
    const scratch = createFoliageSwayScratch();
    const v0 = m.instanceMatrix.version;
    writeFoliageSway(m, INSTANCES, PART, 100, SWAY, scratch);
    const v1 = m.instanceMatrix.version;
    writeFoliageSway(m, INSTANCES, PART, 200, SWAY, scratch);
    expect(v1).toBeGreaterThan(v0);
    expect(m.instanceMatrix.version).toBeGreaterThan(v1);
  });

  it("S4: instances with the same phase lean by the same amount per unit height", () => {
    const m = mesh();
    writeFoliageSway(m, INSTANCES, PART, 180, SWAY, createFoliageSwayScratch());
    const a = displacement(m, 0, INSTANCES[0].swayPivotY + 1.5);
    const b = displacement(m, 1, INSTANCES[1].swayPivotY + 1.5);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
    expect(a.length()).toBeGreaterThan(0);
  });
});
