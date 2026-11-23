/**
 * Spec §4.2. File name follows §3; type name follows §4 (open question 8).
 * Interface and ranges only; converters are out of scope for MFW-8.
 */
export interface NormalizedCylindricalCoord {
  readonly mode: "CYLINDRICAL_SURFACE";
  readonly tierId: number; // integer >= 0 (MFW-8 decision; spec gives no type)
  readonly angleDeg: number; // [0, 360]; 0 = front, 90 = right, 180 = back, 270 = left
  readonly heightRatio: number; // [0, 1]
}

export const ANGLE_DEG_RANGE = [0, 360] as const;
export const HEIGHT_RATIO_RANGE = [0, 1] as const;
