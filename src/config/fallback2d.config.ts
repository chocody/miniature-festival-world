import { CAMERA_FLIGHT_OFFSET, HIGHLIGHT_RING_COLOR, HIGHLIGHT_RING_OPACITY, HIGHLIGHT_RING_SIZES } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { MS_PER_SECOND, RIVER_KRATHONG_TAP_RADIUS } from "./gimmicks.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";
import { LIGHT_PRESETS } from "./look.config";
import { TOY_MATTE_MATERIALS } from "./scene.config";
import { PIER_DECK_MATERIAL, RIVER_BANK_MATERIAL, RIVER_ENVIRONMENT_PARTS } from "./events/loyKrathong.river.config";

/** Flat vector 2D fallback (spec §6.8 Task 8.1, MFW-33). PLACEHOLDER = spec silent (art/feel), owner may tune (plan §11 Q1). */

/** 3/4 view of the 2D krathong = the 3D camera's viewing angles (derived from CAMERA_FLIGHT_OFFSET, no new number). */
export const FLAT_KRATHONG_VIEW_AZIMUTH_RAD = Math.atan2(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]);
export const FLAT_KRATHONG_VIEW_ELEVATION_RAD = Math.atan2(
  CAMERA_FLIGHT_OFFSET[1],
  Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]),
);
/** Puck sides are the top colour × this (flat shading cue). PLACEHOLDER. */
export const FLAT_KRATHONG_SIDE_SHADE = 0.8;
/** CUSTOMIZE preview viewBox, model units: square of half-size halfExtent centred centerLift above the model origin. PLACEHOLDER. */
export const FLAT_KRATHONG_PREVIEW_VIEW = Object.freeze({ halfExtent: 1.7, centerLift: 0.25 });

/** River map height in CSS px (= the 3D viewport's Tailwind h-64). The scale is fitted to it; the width follows. PLACEHOLDER. */
export const FLAT_RIVER_VIEW_HEIGHT_PX = 256;
/** Map padding in CSS px. Lead decision: none (the map is clipped by the scroller). */
export const FLAT_RIVER_PADDING_PX = 0;
/** World units of bank drawn on each side of the water. PLACEHOLDER. */
export const FLAT_RIVER_VISIBLE_BANK_DEPTH = 1.2;
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
/** Find My ring around a river krathong, world units (MFW-17 krathong ring × river scale) and look. */
export const FLAT_RIVER_HIGHLIGHT = Object.freeze({
  innerRadius: HIGHLIGHT_RING_SIZES.krathong.innerRadius * RIVER_KRATHONG_SCALE,
  outerRadius: HIGHLIGHT_RING_SIZES.krathong.outerRadius * RIVER_KRATHONG_SCALE,
  color: HIGHLIGHT_RING_COLOR,
  opacity: HIGHLIGHT_RING_OPACITY,
});
/** Prop footprints, world units (from the 3D part specs). */
export const FLAT_RIVER_PROP_SIZES = Object.freeze({
  houseHalfWidth: RIVER_ENVIRONMENT_PARTS.houseBody.geometry.width / 2,
  houseHalfDepth: RIVER_ENVIRONMENT_PARTS.houseBody.geometry.depth / 2,
  treeRadius: RIVER_ENVIRONMENT_PARTS.treeCanopy.geometry.radius,
  lampRadius: RIVER_ENVIRONMENT_PARTS.lampHead.geometry.radius,
});
/** Unlit flat colours = the 3D materials' base colours (no new colour). */
export const FLAT_VIEW_COLORS = Object.freeze({
  background: LIGHT_PRESETS.DAY.background, // unlit albedo = the DAY look (MFW-47); 2D day/night is MFW-51
  bank: RIVER_BANK_MATERIAL.color,
  water: TOY_MATTE_MATERIALS.water.color,
  pier: PIER_DECK_MATERIAL.color,
  house: RIVER_ENVIRONMENT_PARTS.houseBody.material.color,
  roof: RIVER_ENVIRONMENT_PARTS.houseRoof.material.color,
  tree: RIVER_ENVIRONMENT_PARTS.treeCanopy.material.color,
  lamp: RIVER_ENVIRONMENT_PARTS.lampHead.material.color,
});
/** Accessible names. DRAFT Thai copy (owner review, §11 Q4). */
export const FLAT_VIEW_COPY = Object.freeze({
  previewLabel: "ตัวอย่างกระทง (ภาพ 2 มิติ)",
  riverLabel: "แม่น้ำลอยกระทง (ภาพ 2 มิติ)",
  riverScrollLabel: "เลื่อนดูแม่น้ำ",
});
/** Absolute tolerance of the cylindrical inverse (ratio units for heightRatio and sin). Technical. */
export const CYLINDRICAL_QUADRANT_EPSILON = 1e-9;
