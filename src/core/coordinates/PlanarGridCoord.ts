/**
 * Spec §4.3. File name follows §3; type name follows §4 (open question 8).
 * The zone is the row's `zone_id` column, not part of the coord (open question 7).
 * Interface and ranges only; converters are out of scope for MFW-8.
 */
export interface PlanarZoneCoord {
  readonly mode: "PLANAR_ZONE";
  readonly u: number; // [0, 1]
  readonly v: number; // [0, 1]
}

export const UV_RANGE = [0, 1] as const;
