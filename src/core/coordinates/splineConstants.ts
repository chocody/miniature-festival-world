/** Three-free spline constants (moved from SplinePathCoord.ts in MFW-33; three-free). */
export const SPAWN_PROGRESS_RANGE = [0, 1] as const; // spec §4.1
export const LATERAL_OFFSET_RANGE = [-0.5, 0.5] as const; // spec §4.1
export const SPEED_FACTOR_MIN = 0; // MFW-8 decision: no upstream flow.
/**
 * Sanity cap: at most one full lane per second (spec example 0.008 = 125 s per lane).
 * Spec gives no upper bound; MFW-8 decision. Prevents overflow to NaN in currentProgress.
 */
export const SPEED_FACTOR_MAX = 1;
export const MS_PER_SECOND = 1000; // speedFactor unit = per second (open question 6)
export const SPLINE_CURVE_TYPE = "centripetal" as const;
export const TANGENT_DELTA = 1e-4; // in arc-length progress units
export const HORIZONTAL_TANGENT_EPSILON = 1e-9;
export const LOCATE_COARSE_SAMPLES = 512;
export const LOCATE_BISECTION_ITERATIONS = 60;
