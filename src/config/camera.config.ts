/**
 * Camera offset from the focus at yaw 0 (orthographic viewing angle). The camera rig rotates it about +Y (MFW-57).
 * MFW-68: ×2 of the MFW-15 [4.5, 5.5, 7] — same azimuth atan2(9, 14) and elevation (≈ 33.46°), so the orthographic picture is
 * identical; the distance (≈ 19.95) keeps the near plane off the ground and the scenery at the bottom of the tallest view
 * (SCENE_MAX_VIEW_SIZE.height / PINCH_ZOOM_MIN) and the ground's far edge inside SCENE_CAMERA_FAR (sceneCoverage.test.ts).
 * Technical (lead, MFW-68).
 */
export const CAMERA_FLIGHT_OFFSET = [9, 11, 14] as const;

/** Yaw of the landing view, the post-release view and the customizer hero view (MFW-154); a hand-over into the customizer flies back to it. */
export const DEFAULT_VIEW_YAW_RAD = 0;

/** Smooth, interruptible camera transition tuned for short scene navigation. */
export const CAMERA_FLIGHT_SPRING_CONFIG = Object.freeze({ mass: 1, tension: 170, friction: 26 });

/** Toy scene orthographic camera (MFW-15 values, moved from canvas3d in MFW-27). */
export const SCENE_CAMERA_ZOOM = 52;
export const SCENE_CAMERA_NEAR = 0.1;
export const SCENE_CAMERA_FAR = 40;
/**
 * MFW-54/MFW-68: view-plane rectangle (world units, centred on the camera focus) that stays in view ("contain") whenever the
 * viewport's aspect ratio is within [width / SCENE_MAX_VIEW_SIZE.height, SCENE_MAX_VIEW_SIZE.width / height] and the cap does not
 * bind. PLACEHOLDER (owner approves from the MFW-68 screenshots, open question 42): 5.4 wide ≥ 2 × 2.55, the far-bank water edge
 * at the pier seen from the pier tip (ritual / world view), and 360 / 5.4 ≈ 66.7 ≥ SCENE_CAMERA_ZOOM, so tap discs are ≥
 * MIN_TOUCH_TARGET_PX from 281 px wide; 4.0 high ≥ 2 × 1.92 (the same bank edge, vertically) for landscape phones.
 * ≈ 1.37× closer than MFW-49 (7.4 × 4.9) on portrait phones, 1.22× on 844×390. sceneFraming.test.ts pins that the pier and both
 * banks stay inside the ritual / world view.
 */
export const SCENE_FRAME_VIEW_SIZE = Object.freeze({ width: 5.4, height: 4 });
/** MFW-68: zoom cap factor 2 → 2.75 (cap 104 → 143, 1.375× closer on 1440×900, which shows ≈ 10.1 × 6.3 units). PLACEHOLDER. */
export const SCENE_CAMERA_ZOOM_MAX_FACTOR = 2.75;
export const SCENE_CAMERA_ZOOM_MAX = SCENE_CAMERA_ZOOM * SCENE_CAMERA_ZOOM_MAX_FACTOR;
/**
 * MFW-68: the most world (view-plane units) any viewport shows at pinch factor 1. The framed zoom never goes below
 * max(width / 20, height / 13), so the ground and the camera planes can cover every viewport size (AC2). 13 ≥ 5.4 × 960 / 411
 * (21:9 phone portrait, 12.6) and 20 ≥ 2560 / 143 (QHD desktop, 17.9): common screens keep the contain framing.
 * PLACEHOLDER (lead, MFW-68; owner approves with the framing).
 */
export const SCENE_MAX_VIEW_SIZE = Object.freeze({ width: 20, height: 13 });
/** MFW-57 camera drag-to-travel. PLACEHOLDER (spec silent; owner tunes on device, MFW-57) unless marked technical. */
/** Fraction of the finger motion applied past a soft pan bound (rubber band). PLACEHOLDER (spec silent; owner tunes on device, MFW-57). */
export const CAMERA_PAN_EDGE_RESISTANCE = 0.35;
/** World units the focus may go past a soft pan bound while dragging. PLACEHOLDER (spec silent; owner tunes on device, MFW-57). */
export const CAMERA_PAN_MAX_OVERSHOOT = 0.6;
/** Time constant of the release ease-out (velocity × e^(−t/τ)) and of the return into bounds. PLACEHOLDER (spec silent; owner tunes on device, MFW-57). */
export const CAMERA_PAN_EASE_TIME_CONSTANT_MS = 325;
/** A release this long after the last move does not coast (the finger had stopped). PLACEHOLDER (spec silent; owner tunes on device, MFW-57). */
export const CAMERA_PAN_RELEASE_IDLE_MS = 100;
/** Release speed cap, world units per second. PLACEHOLDER (spec silent; owner tunes on device, MFW-57). */
export const CAMERA_PAN_MAX_RELEASE_SPEED = 20;
/** Technical: coasting stops below this speed (world units / s; < 3 px/s at the base zoom, invisible). */
export const CAMERA_PAN_STOP_SPEED = 0.05;
/** Technical: the return into bounds snaps when this close (world units); = the e2e camera-rest epsilon. */
export const CAMERA_PAN_REST_EPSILON = 1e-4;
