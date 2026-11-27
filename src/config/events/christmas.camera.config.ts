/*
 * Default Christmas camera framing (MFW-93, plan L16 §1). Every value is DRAFT (plan R7): the owner approves it from the
 * MFW-100 screenshots. growingTree.projection.test.ts proves tap separation at this framing.
 */

/** View-plane rectangle (world units) the framed zoom keeps visible. DRAFT (plan R7): owner approves from MFW-100 screenshots. */
export const CHRISTMAS_FRAME_VIEW_SIZE = Object.freeze({ width: 4.6, height: 6 });

/** Orthographic camera pitch above the horizontal, degrees. DRAFT (plan R7): owner approves from MFW-100 screenshots. */
export const CHRISTMAS_CAMERA_ELEVATION_DEG = 20;

/**
 * Slots within this angle (degrees) of the view direction are guaranteed tap-separated (plan §1); slots further round are
 * reached by orbiting. DRAFT (plan R7): owner approves from MFW-100 screenshots.
 */
export const CHRISTMAS_TAP_VIEW_HALF_ANGLE_DEG = 45;
