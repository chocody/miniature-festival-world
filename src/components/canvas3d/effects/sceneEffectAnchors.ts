import { FALLING_LEAF_LOOK, TAP_SHAKE_WIND } from "@/config/gimmicks.config";
import type { RiverLane, WorldVec3 } from "@/core/coordinates";
import { GOLDEN_ANGLE_RAD } from "@/core/effects/reactionCurves";
import {
  bankSurfaceY,
  riverFrameAt,
  type BankPlacement,
  type BankProfilePoint,
  type FoliageInstance,
  type FoliageOwnerRef,
  type InstanceTransform,
} from "@/core/world";
import { foliageBody } from "./propTapTargets";

/*
 * MFW-72 / MFW-84: where the chimney smoke and the falling leaves of each house / tree start, in stretch-0 world-view space. Derived
 * once from the resolved layout and existing constants (never per frame); render-time only — NEVER persisted or sent (invariant A).
 */

/**
 * One smoke origin per house (MFW-84): the chimney top `chimneyTopLocal` (house-local) through the house transform — world = position
 * + scale·(c.x·cos yaw + c.z·sin yaw, c.y, −c.x·sin yaw + c.z·cos yaw) — plus liftY. This is the three.js Y rotation that
 * composeInstanceMatrix uses (local +Z → (sin yaw, 0, cos yaw)). Frozen.
 */
export function buildHouseSmokeOrigins(
  houses: readonly InstanceTransform[],
  chimneyTopLocal: Readonly<{ x: number; y: number; z: number }>,
  liftY: number,
): readonly WorldVec3[] {
  const c = chimneyTopLocal;
  return Object.freeze(
    houses.map((h) => {
      const cos = Math.cos(h.yawRad);
      const sin = Math.sin(h.yawRad);
      return Object.freeze({
        x: h.position.x + h.scale * (c.x * cos + c.z * sin),
        y: h.position.y + h.scale * c.y + liftY,
        z: h.position.z + h.scale * (-c.x * sin + c.z * cos),
      });
    }),
  );
}

/** Floats per leaf slot in TreeLeafAnchor.paths: spawn x, y, z, landing x, y, z. */
export const TREE_LEAF_PATH_STRIDE = 6;

/** The precomputed leaf paths of one tree (stretch-0 world-view space; the writer adds s·T). Render-time only (invariant A). */
export interface TreeLeafAnchor {
  readonly treeIndex: number;
  readonly slots: number;
  readonly paths: Float64Array; // TREE_LEAF_PATH_STRIDE floats per slot (float64: landing heights exact to the bank profile)
}

export interface TreeLeafAnchorInput {
  readonly trees: readonly BankPlacement[];
  readonly trunks: readonly InstanceTransform[]; // one per tree (same order)
  readonly clumps: readonly FoliageInstance[]; // the FULL crown clumps
  readonly clumpOwners: readonly FoliageOwnerRef[]; // parallel to clumps
  readonly clumpLumpAmplitude: number;
  readonly channel: RiverLane;
  readonly bankProfile: readonly BankProfilePoint[];
  readonly slots: number;
}

/**
 * One anchor per tree (treeIndex = i). Crown = the box over tree i's FULL clumps (foliageBody, no trunk base). Slot k: angle =
 * (k + i/2)·GOLDEN_ANGLE_RAD; spawn = crown centre + (cos·spawnRadiusRatio, −spawnDropRatio, sin·spawnRadiusRatio)·crownRadius;
 * landing xz = spawn xz + wind·driftDistance; landing y = bankSurfaceY(profile, offset) + restLiftY with offset = side·((x − c.x)·right.x
 * + (z − c.z)·right.z) − channel.width / 2 at the tree's river frame (the farthest tree stands on the bank slope, D8). A tree without
 * clumps gets slots 0. Deterministic.
 */
export function buildTreeLeafAnchors(input: TreeLeafAnchorInput): readonly TreeLeafAnchor[] {
  const { trees, trunks, clumps, clumpOwners, clumpLumpAmplitude, channel, bankProfile, slots } = input;
  if (trees.length !== trunks.length) throw new RangeError("trees and trunks must have the same length");
  if (!Number.isInteger(slots) || slots < 0) throw new RangeError("slots must be an integer >= 0");
  const L = FALLING_LEAF_LOOK;
  return Object.freeze(
    trees.map((tree, i) => {
      const crown = foliageBody(clumps, clumpOwners, "tree", i, clumpLumpAmplitude, null);
      if (crown === null) return Object.freeze({ treeIndex: i, slots: 0, paths: new Float64Array(0) });
      const { centerline: c, right } = riverFrameAt(channel, tree.progress);
      const paths = new Float64Array(slots * TREE_LEAF_PATH_STRIDE);
      const r = crown.radius;
      for (let k = 0; k < slots; k++) {
        const angle = (k + i / 2) * GOLDEN_ANGLE_RAD;
        const sx = crown.center.x + Math.cos(angle) * L.spawnRadiusRatio * r;
        const sy = crown.center.y - L.spawnDropRatio * r;
        const sz = crown.center.z + Math.sin(angle) * L.spawnRadiusRatio * r;
        const lx = sx + TAP_SHAKE_WIND.windDirX * L.driftDistance;
        const lz = sz + TAP_SHAKE_WIND.windDirZ * L.driftDistance;
        const offset = tree.side * ((lx - c.x) * right.x + (lz - c.z) * right.z) - channel.width / 2;
        const ly = bankSurfaceY(bankProfile, offset) + L.restLiftY;
        paths.set([sx, sy, sz, lx, ly, lz], k * TREE_LEAF_PATH_STRIDE);
      }
      return Object.freeze({ treeIndex: i, slots, paths });
    }),
  );
}
