import { Matrix4, type InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import { foliageSwayShearAt, type FoliageInstance, type FoliageSwayParams } from "@/core/world";
import { composeInstanceMatrix } from "./instancing";

/** Reused matrices of one swaying mesh (created once per component, never per frame). */
export interface FoliageSwayScratch {
  readonly base: Matrix4;
  readonly shear: Matrix4;
  readonly out: Matrix4;
}

export function createFoliageSwayScratch(): FoliageSwayScratch {
  return { base: new Matrix4(), shear: new Matrix4(), out: new Matrix4() };
}

/**
 * Allocation-free. For each instance i: M = composeInstanceMatrix(instances[i], part, base); k = foliageSwayShearAt(timeMs,
 * instances[i].swayPhaseRad, sway); kx = k·windDirX, kz = k·windDirZ; S = shear.makeShear(0, 0, kx, kz, 0, 0).setPosition(
 * −kx·pivotY, 0, −kz·pivotY); setMatrixAt(i, out.multiplyMatrices(S, M)). Then instanceMatrix.needsUpdate = true.
 * A point at height h above swayPivotY moves (kx·h, 0, kz·h); the pivot height stays put. No bounding-sphere update (≤ shear·height).
 */
export function writeFoliageSway(
  mesh: Pick<InstancedMesh, "setMatrixAt" | "instanceMatrix">,
  instances: readonly FoliageInstance[],
  part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
  timeMs: number,
  sway: FoliageSwayParams,
  scratch: FoliageSwayScratch,
): void {
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    composeInstanceMatrix(instance, part, scratch.base);
    const k = foliageSwayShearAt(timeMs, instance.swayPhaseRad, sway);
    const kx = k * sway.windDirX;
    const kz = k * sway.windDirZ;
    scratch.shear.makeShear(0, 0, kx, kz, 0, 0).setPosition(-kx * instance.swayPivotY, 0, -kz * instance.swayPivotY);
    mesh.setMatrixAt(i, scratch.out.multiplyMatrices(scratch.shear, scratch.base));
  }
  mesh.instanceMatrix.needsUpdate = true;
}
