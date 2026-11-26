import { CAMERA_FLIGHT_OFFSET } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MARK_CUE, MS_PER_SECOND, RIVER_KRATHONG_TAP_RADIUS } from "./gimmicks.config";
import { LIVING_WORLD_TIERS } from "./performance.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";

/** Flat vector 2D fallback (spec §6.8 Task 8.1, MFW-33). PLACEHOLDER = spec silent (art/feel), owner may tune (plan §11 Q1). */

/** 3/4 view of the 2D krathong = the 3D camera's viewing angles (derived from CAMERA_FLIGHT_OFFSET, no new number). */
export const FLAT_KRATHONG_VIEW_AZIMUTH_RAD = Math.atan2(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]);
export const FLAT_KRATHONG_VIEW_ELEVATION_RAD = Math.atan2(
  CAMERA_FLIGHT_OFFSET[1],
  Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]),
);
/** CUSTOMIZE preview viewBox, model units: square of half-size halfExtent centred centerLift above the model origin. PLACEHOLDER. */
export const FLAT_KRATHONG_PREVIEW_VIEW = Object.freeze({ halfExtent: 1.7, centerLift: 0.25 });

/** River map height in CSS px (= the 3D viewport's Tailwind h-64). The scale is fitted to it; the width follows. PLACEHOLDER. */
export const FLAT_RIVER_VIEW_HEIGHT_PX = 256;
/** Map padding in CSS px. Lead decision: none (the map is clipped by the scroller). */
export const FLAT_RIVER_PADDING_PX = 0;
/**
 * World units of bank drawn on each side of the water (across the flow only; along the flow the map is cropped at the water,
 * see resolveFlatRiverScene). 1.2 → 3.2 in MFW-51 so the village (houses at setback 1.45 / 2.6) and most riverside trees are on
 * the map; at 390×844 the map scale is ≈ 70.7 px per world unit (3D phone framing ≈ 72). DRAFT (MFW-51, owner review).
 */
export const FLAT_RIVER_VISIBLE_BANK_DEPTH = 3.2;
/**
 * Lane progress cropped at each end of the map so the % 1 wrap is never drawn (owner decision 22). PLACEHOLDER; must hide a whole
 * sprite (flatRiverScene.test.ts pins margin × lane length > RIVER_COLLISION_RADIUS).
 * 0.05 → 0.06 in MFW-49: the wider lane (3.0) puts the lane ends nearer the map edge (worst wrap slack 1.4 px at 0.05,
 * 8.8 px at 0.06), so the 2D map drops 0.01 of river at each end.
 */
export const FLAT_RIVER_END_MARGIN_PROGRESS = 0.06;
/** Frame budget of the 2D river (transform-only writes). PLACEHOLDER lead value. */
export const FLAT_RIVER_TARGET_FPS = 30;
export const FLAT_RIVER_FRAME_INTERVAL_MS = MS_PER_SECOND / FLAT_RIVER_TARGET_FPS;
/** World units per model unit of a river sprite = the 3D river krathong scale (invariant B: same size in both views). */
export const FLAT_RIVER_SPRITE_SCALE = RIVER_KRATHONG_SCALE;
/** Tap target radius of a river krathong in world units = MFW-28's 3D hit proxy (model units) × river scale. */
export const FLAT_RIVER_TAP_RADIUS = RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE;

/** Minimum on-screen radius of a 2D krathong hit circle (CSS px; the river SVG is drawn 1:1). */
export const FLAT_MIN_TAP_RADIUS_PX = MIN_TOUCH_TARGET_PX / 2;
/** Find My cue in 2D = the 3D mark's steady size-up (MFW-67: no ring; same cue in both views). */
export const FLAT_RIVER_MARK_SCALE = KRATHONG_MARK_CUE.scale;
/** Leaf midrib on full-LOD krathongs: stroke = leaf fill × shade (shadeHex), width in model units. DRAFT (MFW-51). */
export const FLAT_KRATHONG_VEIN = Object.freeze({ shade: 0.75, width: 0.015 });
/** Two-tone clay sphere (tree / bush clumps): highlight circle centre offset toward the key light and its radius, both × clump radius. DRAFT (MFW-51). */
export const FLAT_SPHERE_HIGHLIGHT = Object.freeze({ offset: 0.25, radius: 0.72 });
/** Lathe silhouettes are sampled at this many segments (the 3D low LOD is an octagon that reads round only with smooth shading). Technical (MFW-51). */
export const FLAT_LATHE_SILHOUETTE_SEGMENTS = 48;
/** Decimals of every SVG path number (model units or CSS px; 0.001 ≪ 1 px). Technical (MFW-51). */
export const FLAT_PATH_DECIMALS = 3;
/** Stops of the blob-shadow radial gradient, sampled from the 3D fan's alpha (1 − t)^falloffExponent. Technical (MFW-51). */
export const FLAT_BLOB_GRADIENT_STOPS = 5;
/** Steps of the shore highlight band; step j's opacity = shoreOpacity × the mean of the 3D linear 1→0 ramp over the step. Technical (MFW-51). */
export const FLAT_SHORE_BAND_STEPS = 2;
/** FALLBACK_2D shows the LOW living world: its villager count, standing still (LIVING_WORLD_TIERS.LOW.villagersWalk is false). Loop decision (MFW-51). */
export const FLAT_RIVER_VILLAGER_COUNT = LIVING_WORLD_TIERS.LOW.villagerCount;
/** Accessible names. DRAFT Thai copy (owner review, §11 Q4). */
export const FLAT_VIEW_COPY = Object.freeze({
  previewLabel: "ตัวอย่างกระทง (ภาพ 2 มิติ)",
  riverLabel: "แม่น้ำลอยกระทง (ภาพ 2 มิติ)",
  riverScrollLabel: "เลื่อนดูแม่น้ำ",
});
/** Absolute tolerance of the cylindrical inverse (ratio units for heightRatio and sin). Technical. */
export const CYLINDRICAL_QUADRANT_EPSILON = 1e-9;
