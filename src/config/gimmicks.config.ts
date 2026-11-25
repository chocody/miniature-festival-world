import { SCENE_CAMERA_ZOOM } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE, RIVER_MIN_CENTER_SPACING } from "./riverFlow.config";

/** Scene tap gimmicks (spec §6.6 Task 6.2). Looks and timings are PLACEHOLDER (spec silent) unless marked. */

/** WCAG 2.3.1 "Three Flashes": no luminance cycle faster than this many per second. Standard, not a product number. */
export const WCAG_MAX_FLASHES_PER_SECOND = 3;
export const MS_PER_SECOND = 1_000;

/** Water ripple: a flat ring (unit outer radius, scaled to `radius`) that expands and fades. Additive colour × intensity. */
export const RIPPLE_LOOK = Object.freeze({
  color: "#cfe3ff",
  peakIntensity: 0.55,
  startRadius: 0.08, // world units
  endRadius: 0.6, // world units; also the reduced-motion radius (no expansion)
  durationMs: 900,
  ringInnerRatio: 0.82, // inner radius of the unit ring
  ringSegments: 32,
  surfaceOffsetY: 0.01, // above the water surface (no z-fighting)
});

/** Lamp light-up: an unlit additive shell over the lamp head; attack → hold (flicker) → release. No light source (MFW-27 D5). */
export const LAMP_GLOW_LOOK = Object.freeze({
  color: "#ffc46b",
  peakIntensity: 1,
  shellScale: 1.35, // × lamp head size; encloses the head
  durationMs: 1_600,
  attackMs: 120,
  releaseMs: 500,
  flickerDepth: 0.3, // intensity dips to (1 − depth) at most
  flickerPeriodAMs: 430, // two sines are ADDED (a product would create a sum frequency above 3 Hz)
  flickerPeriodBMs: 690,
});

/** "เด้งเล็กน้อย / เด้งตอบสนองเบาๆ": scale = 1 + amplitude · e^(−t/decay) · sin(2πt/period) for t < duration. Shared by lamp and krathong. */
export const GIMMICK_BOUNCE = Object.freeze({ amplitude: 0.12, periodMs: 280, decayMs: 200, durationMs: 700 });

/** Lead decision: the residual bounce at durationMs is below this, so ending at exactly 1 is not a visible snap. */
export const BOUNCE_SETTLE_EPSILON = 0.005;

/**
 * Hit-proxy radius of a river krathong, in MODEL units (inside the group scaled by RIVER_KRATHONG_SCALE). Lead decision, derived only
 * from existing constants: aim for a MIN_TOUCH_TARGET_PX-wide target at the default zoom, never smaller than the model footprint, and
 * never larger than half the no-overlap spacing (owner decision 25), so two proxies never overlap.
 */
export const RIVER_KRATHONG_TAP_RADIUS = Math.max(
  KRATHONG_MODEL_FOOTPRINT_RADIUS,
  Math.min(
    MIN_TOUCH_TARGET_PX / 2 / SCENE_CAMERA_ZOOM / RIVER_KRATHONG_SCALE,
    RIVER_MIN_CENTER_SPACING / 2 / RIVER_KRATHONG_SCALE,
  ),
);
