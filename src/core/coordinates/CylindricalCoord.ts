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

const FULL_TURN_DEG = ANGLE_DEG_RANGE[1];

/** Default absolute surface tolerance (world units) for worldToCylindricalCoord: numerical slack for exact analytic hits only. */
export const CYLINDRICAL_HIT_TOLERANCE_DEFAULT = 1e-9;

function assertValidTier(tier: CylindricalTierGeometry): void {
  if (!Number.isInteger(tier.tierId) || tier.tierId < 0) throw new RangeError("tier.tierId must be an integer >= 0");
  if (![tier.baseY, tier.height, tier.bottomRadius, tier.topRadius].every(Number.isFinite)) {
    throw new RangeError("tier geometry must be finite");
  }
  if (tier.height <= 0) throw new RangeError("tier.height must be > 0");
  if (tier.bottomRadius < 0 || tier.topRadius < 0) throw new RangeError("tier radii must be >= 0");
}

/**
 * Inverse of cylindricalCoordToWorld: a world hit point on the tier frustum → NormalizedCylindricalCoord,
 * or null when the point is off the surface (beyond `tolerance` world units vertically past the tier slab
 * or horizontally from the frustum radius). heightRatio is clamped to [0, 1]; angleDeg is in [0, 360).
 */
export function worldToCylindricalCoord(
  hit: WorldVec3,
  tier: CylindricalTierGeometry,
  tolerance: number = CYLINDRICAL_HIT_TOLERANCE_DEFAULT,
): NormalizedCylindricalCoord | null {
  assertValidTier(tier);
  if (![hit.x, hit.y, hit.z].every(Number.isFinite)) throw new RangeError("hit must be finite");
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("tolerance must be finite and >= 0");

  if (hit.y < tier.baseY - tolerance || hit.y > tier.baseY + tier.height + tolerance) return null;
  const hRaw = (hit.y - tier.baseY) / tier.height;
  const h = Math.min(1, Math.max(0, hRaw));

  const r = Math.hypot(hit.x, hit.z);
  const expectedR = tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * h;
  if (Math.abs(r - expectedR) > tolerance) return null;

  let angleDeg = 0;
  if (r !== 0) {
    angleDeg = (Math.atan2(hit.x, hit.z) * HALF_TURN_DEG) / Math.PI;
    if (angleDeg < 0) angleDeg += FULL_TURN_DEG;
    if (angleDeg === FULL_TURN_DEG) angleDeg = 0;
  }
  return { mode: "CYLINDRICAL_SURFACE", tierId: tier.tierId, angleDeg, heightRatio: h };
}

/** Outward unit normal of the tier frustum at coord. A direction, derived at render time, NEVER persisted. */
export function cylindricalSurfaceNormal(coord: NormalizedCylindricalCoord, tier: CylindricalTierGeometry): WorldVec3 {
  assertValidTier(tier);
  if (coord.tierId !== tier.tierId) throw new RangeError("coord.tierId does not match tier");
  if (![coord.angleDeg, coord.heightRatio].every(Number.isFinite)) throw new RangeError("cylindrical inputs must be finite");
  const a = (coord.angleDeg * Math.PI) / HALF_TURN_DEG;
  const H = tier.height;
  const dR = tier.topRadius - tier.bottomRadius;
  const len = Math.hypot(H, dR);
  return { x: (H * Math.sin(a)) / len, y: -dR / len, z: (H * Math.cos(a)) / len };
}
