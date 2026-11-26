import { Matrix4, type InstancedMesh } from "three";
import { TAP_SHAKE_WIND } from "@/config/gimmicks.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { findNudgeEntry, writeNudgeAt, type NudgeFrame, type NudgeState, type ObjectPool } from "@/core/effects";
import { foliageSwayShearAt, type FoliageInstance, type FoliageOwnerRef, type FoliageSwayParams } from "@/core/world";
import { composeInstanceMatrix } from "./instancing";

/** Reused matrices of one swaying mesh (created once per component, never per frame). */
export interface FoliageSwayScratch {
  readonly base: Matrix4;
  readonly shear: Matrix4;
  readonly out: Matrix4;
  readonly scale: Matrix4;
}

export function createFoliageSwayScratch(): FoliageSwayScratch {
  return { base: new Matrix4(), shear: new Matrix4(), out: new Matrix4(), scale: new Matrix4() };
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
  writeFoliageSwayAndShake(mesh, instances, part, timeMs, sway, null, scratch);
}

/** MFW-60 tap shake input of one foliage mesh. `nowMs` / `reducedMotion` are refreshed by the owner every frame; nothing is allocated. */
export interface FoliageShakeInput {
  pool: ObjectPool<NudgeState>;
  owners: readonly FoliageOwnerRef[]; // parallel to the instances
  nowMs: number; // the effect clock (NudgeSource.now)
  reducedMotion: boolean;
  frame: NudgeFrame;
}

/**
 * writeFoliageSway plus the MFW-60 tap reaction. Per instance: base = composeInstanceMatrix; k = sway ? foliageSwayShearAt(…) : 0;
 * when its owner has an active nudge entry: f = writeNudgeAt(owner.kind, nowMs − startedAtMs, reducedMotion): k += f.shear and
 * base ·= S(f.scale) (about the instance origin). Axis = the sway wind, or TAP_SHAKE_WIND when sway is null. Writes every instance;
 * returns true when any instance had an active entry. Allocation-free.
 */
export function writeFoliageSwayAndShake(
  mesh: Pick<InstancedMesh, "setMatrixAt" | "instanceMatrix">,
  instances: readonly FoliageInstance[],
  part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
  swayTimeMs: number,
  sway: FoliageSwayParams | null,
  shake: FoliageShakeInput | null,
  scratch: FoliageSwayScratch,
): boolean {
  const windX = sway ? sway.windDirX : TAP_SHAKE_WIND.windDirX;
  const windZ = sway ? sway.windDirZ : TAP_SHAKE_WIND.windDirZ;
  const active = shake !== null && shake.pool.activeCount > 0 ? shake : null;
  let nudged = false;
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    composeInstanceMatrix(instance, part, scratch.base);
    let k = sway ? foliageSwayShearAt(swayTimeMs, instance.swayPhaseRad, sway) : 0;
    const owner = active !== null ? active.owners[i] : undefined;
    const entry = active !== null && owner !== undefined ? findNudgeEntry(active.pool, owner.kind, owner.index) : null;
    if (active !== null && owner !== undefined && entry !== null) {
      const f = writeNudgeAt(owner.kind, active.nowMs - entry.startedAtMs, active.reducedMotion, active.frame);
      k += f.shear;
      if (f.scale !== 1) scratch.base.multiply(scratch.scale.makeScale(f.scale, f.scale, f.scale));
      nudged = true;
    }
    const kx = k * windX;
    const kz = k * windZ;
    scratch.shear.makeShear(0, 0, kx, kz, 0, 0).setPosition(-kx * instance.swayPivotY, 0, -kz * instance.swayPivotY);
    mesh.setMatrixAt(i, scratch.out.multiplyMatrices(scratch.shear, scratch.base));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return nudged;
}
