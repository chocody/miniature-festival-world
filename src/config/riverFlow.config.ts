/**
 * The ONE drift speed for every new river krathong (owner decision 25: equal speed → spacing never changes).
 * Progress (fraction of the lane) per second, open question 6. Value = the spec §4.1 example "speedFactor … เช่น 0.008".
 * SplinePathCoord keeps its speedFactor field; every write path sets it to this value.
 */
export const RIVER_DRIFT_SPEED_FACTOR = 0.008;

/** Uniform scale of a river krathong model. Lead design, owner-delegated (open question 24). */
export const RIVER_KRATHONG_SCALE = 0.22;

/**
 * Horizontal footprint radius of a krathong model at scale 1 (world units). Covers MFW-19's widest part: base radius 1.2,
 * rim radius 1.0 + leaf radius 0.28 = 1.28 (checked by riverFlow.config.test.ts). Lead design.
 */
export const KRATHONG_MODEL_FOOTPRINT_RADIUS = 1.3;

/** Collision radius of a river krathong (world units) = footprint × river scale (owner decision 25). */
export const RIVER_COLLISION_RADIUS = KRATHONG_MODEL_FOOTPRINT_RADIUS * RIVER_KRATHONG_SCALE;

/**
 * Safety factor on the parametric spacing: on a bend, points at the same arc-length gap sit closer on the inner side.
 * 1.1 keeps world distance ≥ 2 × RIVER_COLLISION_RADIUS on the product lane (riverCollision.test.ts). Lead design.
 */
export const RIVER_COLLISION_CURVATURE_MARGIN = 1.1;

/** Minimum distance between two krathong centres in the lane's (arc length, lateral) metric, world units. */
export const RIVER_MIN_CENTER_SPACING = 2 * RIVER_COLLISION_RADIUS * RIVER_COLLISION_CURVATURE_MARGIN;

/** Free-spot search grid resolution: grid step = RIVER_MIN_CENTER_SPACING / this. Lead design. */
export const RIVER_SPOT_SEARCH_STEPS_PER_SPACING = 4;

/** Procedural bobbing (spec §6.5 Task 5.2 "ลอยโคลงเคลงเบาๆ"). Lead design, owner-delegated (open question 24). */
export const RIVER_BOB_HEAVE_AMPLITUDE = 0.02; // world units
export const RIVER_BOB_HEAVE_PERIOD_MS = 2_600;
export const RIVER_BOB_PITCH_AMPLITUDE_RAD = 0.05;
export const RIVER_BOB_PITCH_PERIOD_MS = 3_400;
export const RIVER_BOB_ROLL_AMPLITUDE_RAD = 0.04;
export const RIVER_BOB_ROLL_PERIOD_MS = 4_100;
