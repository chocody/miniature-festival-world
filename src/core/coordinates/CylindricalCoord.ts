import type { WorldVec3 } from "./types";

/**
 * Spec §4.2. File name follows §3; type name follows §4 (open question 8).
 * 3D converter added in MFW-33 (spec §4.2 formula only).
 */
export interface NormalizedCylindricalCoord {
  readonly mode: "CYLINDRICAL_SURFACE";
  readonly tierId: number; // integer >= 0 (MFW-8 decision; spec gives no type)
  readonly angleDeg: number; // [0, 360]; 0 = front, 90 = right, 180 = back, 270 = left
  readonly heightRatio: number; // [0, 1]
}

export const ANGLE_DEG_RANGE = [0, 360] as const;
export const HEIGHT_RATIO_RANGE = [0, 1] as const;

/** World geometry of one tree tier (spec §4.2: R_bottom, R_top, Y_tierBase, H_tier). Scene config, never persisted. */
export interface CylindricalTierGeometry {
  readonly tierId: number;
  readonly baseY: number; // Y_tierBase, world units
  readonly height: number; // H_tier, finite > 0
  readonly bottomRadius: number; // R_bottom = R(0), finite >= 0
  readonly topRadius: number; // R_top = R(1), finite >= 0
}

const HALF_TURN_DEG = 180;

/**
 * Spec §4.2: R(h) = lerp(R_bottom, R_top, h); X = R(h)·sin(angleRad), Y = Y_tierBase + h·H_tier, Z = R(h)·cos(angleRad).
 * Derived at render time, NEVER persisted (invariant A). Surface-normal orientation and scale lock are out of scope (Christmas card).
 */
export function cylindricalCoordToWorld(coord: NormalizedCylindricalCoord, tier: CylindricalTierGeometry): WorldVec3 {
  if (coord.tierId !== tier.tierId) throw new RangeError("coord.tierId does not match tier");
  if (
    ![coord.angleDeg, coord.heightRatio, tier.baseY, tier.height, tier.bottomRadius, tier.topRadius].every(Number.isFinite)
  ) {
    throw new RangeError("cylindrical inputs must be finite");
  }
  const h = coord.heightRatio;
  const r = tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * h;
  const a = (coord.angleDeg * Math.PI) / HALF_TURN_DEG;
  return { x: r * Math.sin(a), y: tier.baseY + h * tier.height, z: r * Math.cos(a) };
}
