/** Pointer gesture thresholds and scales chosen for touch-sized scene controls. */
export const TAP_MAX_DURATION_MS = 250;
export const DRAG_START_DISTANCE_PX = 8;
export const PINCH_ZOOM_MIN = 0.75;
export const PINCH_ZOOM_MAX = 1.6;
export const ROTATION_RADIANS_PER_PIXEL = 0.01;

/** RITUAL_RELEASE "กระทง" chip start position, percent of the viewport. The ritual camera centres the pier tip (MFW-23), so the
 * drag handle starts on the preview krathong. */
export const RITUAL_CHIP_START_PERCENT = Object.freeze({ x: 50, y: 50 });
/** The chip is clamped to this percent range on both axes so it stays reachable. */
export const RITUAL_CHIP_MIN_PERCENT = 8;
export const RITUAL_CHIP_MAX_PERCENT = 92;
/** px delta / viewport size × PERCENT_SCALE = percent delta. */
export const PERCENT_SCALE = 100;

/** One tap on หมุนซ้าย / หมุนขวา turns the krathong by this much (CUSTOMIZE). PLACEHOLDER (spec silent): 8 taps = one turn. */
export const CUSTOMIZE_ROTATE_STEP_RADIANS = Math.PI / 4;
/** One tap on ซูมเข้า multiplies the zoom factor by this, ซูมออก divides by it; clamped to PINCH_ZOOM_MIN..MAX. PLACEHOLDER (spec silent). */
export const CUSTOMIZE_ZOOM_STEP_SCALE = 1.25;

/** Two-finger twist starts turning the view only after the fingers turned this much (keeps a pinch from rotating). PLACEHOLDER (spec silent; MFW-57). */
export const TWIST_START_RADIANS = 0.15;
/** Wheel zoom: scale = exp(−deltaPx × WHEEL_ZOOM_PER_PIXEL) (a 100-px notch ≈ ×0.82 / ×1.22). PLACEHOLDER (spec silent; MFW-57). */
export const WHEEL_ZOOM_PER_PIXEL = 0.002;
/** Technical: px per line for WheelEvent.deltaMode = DOM_DELTA_LINE. */
export const WHEEL_LINE_HEIGHT_PX = 16;
/** One tap on the world rotate button turns the view by this much (8 taps = one turn). PLACEHOLDER (spec silent; MFW-57). */
export const WORLD_VIEW_ROTATE_STEP_RADIANS = Math.PI / 4;
/** World rotate button copy. DRAFT (MFW-55 restyles). */
export const WORLD_VIEW_ROTATE_BUTTON_COPY = Object.freeze({ label: "หมุน", ariaLabel: "หมุนมุมมอง" });
