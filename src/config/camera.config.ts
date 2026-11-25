/** Reusable orthographic viewing angle for focusing targets in the miniature world. */
export const CAMERA_FLIGHT_OFFSET = [4.5, 5.5, 7] as const;

/** Smooth, interruptible camera transition tuned for short scene navigation. */
export const CAMERA_FLIGHT_SPRING_CONFIG = Object.freeze({ mass: 1, tension: 170, friction: 26 });

/** Per-target highlight rings, sized to remain visible around the scene object. */
export const HIGHLIGHT_RING_SIZES = Object.freeze({
  water: Object.freeze({ innerRadius: 0.42, outerRadius: 0.56, heightOffset: 0.04 }),
  krathong: Object.freeze({ innerRadius: 1.35, outerRadius: 1.55, heightOffset: 0.26 }),
  lamp: Object.freeze({ innerRadius: 0.28, outerRadius: 0.42, heightOffset: 0.04 }),
  /** Find My ring around a river krathong (MFW-30). Lead design: inner radius clears RIVER_COLLISION_RADIUS (about 0.286), about 5 px wide at zoom 52. Tune on device. */
  riverKrathong: Object.freeze({ innerRadius: 0.34, outerRadius: 0.44, heightOffset: 0.04 }),
});

/** Toy scene orthographic camera (MFW-15 values, moved from canvas3d in MFW-27). */
export const SCENE_CAMERA_ZOOM = 52;
export const SCENE_CAMERA_NEAR = 0.1;
export const SCENE_CAMERA_FAR = 40;
/**
 * MFW-54: view-plane rectangle (world units, centred on the camera focus) that always stays in view; the base zoom is the largest
 * that fits it ("contain"). PLACEHOLDER (spec silent; owner reviews from screenshots): 7.2 wide holds the whole pier deck
 * (|x| ≤ 3.2 in the default view) with a margin, 4.9 high ≈ the old 256-px viewport at SCENE_CAMERA_ZOOM.
 * sceneFraming.test.ts pins that the pier and both banks stay inside.
 */
export const SCENE_FRAME_VIEW_SIZE = Object.freeze({ width: 7.2, height: 4.9 });
/** MFW-54: big screens show more world instead of a bigger krathong. PLACEHOLDER: 2 → 1440×900 shows ≈ 13.8 × 8.7 units (the old desktop viewport showed ≈ 13.5 across). */
export const SCENE_CAMERA_ZOOM_MAX_FACTOR = 2;
export const SCENE_CAMERA_ZOOM_MAX = SCENE_CAMERA_ZOOM * SCENE_CAMERA_ZOOM_MAX_FACTOR;
/** Highlight ring look (MFW-17 values, moved in MFW-27). */
export const HIGHLIGHT_RING_COLOR = "#ffd166";
export const HIGHLIGHT_RING_OPACITY = 0.9;
export const HIGHLIGHT_RING_SEGMENTS = 32;
