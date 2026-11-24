/** Pointer gesture thresholds and scales chosen for touch-sized scene controls. */
export const TAP_MAX_DURATION_MS = 250;
export const DRAG_START_DISTANCE_PX = 8;
export const PINCH_ZOOM_MIN = 0.75;
export const PINCH_ZOOM_MAX = 1.6;
export const ROTATION_RADIANS_PER_PIXEL = 0.01;
export const PAN_WORLD_UNITS_PER_PIXEL = 0.01;

/** RITUAL_RELEASE "กระทง" chip start position, percent of the viewport (MFW-16 values, moved in MFW-27). */
export const RITUAL_CHIP_START_PERCENT = Object.freeze({ x: 50, y: 55 });
/** The chip is clamped to this percent range on both axes so it stays reachable. */
export const RITUAL_CHIP_MIN_PERCENT = 8;
export const RITUAL_CHIP_MAX_PERCENT = 92;
/** px delta / viewport size × PERCENT_SCALE = percent delta. */
export const PERCENT_SCALE = 100;
