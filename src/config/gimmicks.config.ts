import { SCENE_CAMERA_ZOOM } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE } from "./riverFlow.config";

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

/** Lamp light-up: an unlit additive skin just over the lamp head (no halo, MFW-67); attack → hold (flicker) → release. No light source (MFW-27 D5). */
export const LAMP_GLOW_LOOK = Object.freeze({
  color: "#ffc46b",
  peakIntensity: 1,
  shellScale: 1.1, // × lamp head size: a thin additive skin, the head lights up without a halo (MFW-67, DRAFT)
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
 * Selection / Find My cue on a krathong (MFW-67, replaces the highlight ring; owner decision, open question 40): the marked krathong
 * plays one GIMMICK_BOUNCE, then stays `scale` × its size while it is marked. The steady size-up is the cue under reduced motion and
 * does not rely on colour. DRAFT (owner reviews it from the PR screenshots). 1.2 = the largest steady size that still clears a
 * neighbour at RIVER_MIN_CENTER_SPACING (gimmicks.config.test.ts).
 */
export const KRATHONG_MARK_CUE = Object.freeze({ scale: 1.2 });

/** Inradius / circumradius of a regular icosahedron: the detail-0 tap-proxy shape (riverTapProxy.ts). Geometry, not a product number. */
export const TAP_PROXY_INRADIUS_RATIO = Math.sqrt((5 + 2 * Math.sqrt(5)) / 15); // ≈ 0.7947

/** World radius whose on-screen diameter is MIN_TOUCH_TARGET_PX at the scene zoom (WORLD_EXPLORE has no zoom gesture). */
export const MIN_TOUCH_TARGET_WORLD_RADIUS = MIN_TOUCH_TARGET_PX / 2 / SCENE_CAMERA_ZOOM;

/** Lamp hit-proxy circumradius in WORLD units: its inscribed sphere projects to ≥ MIN_TOUCH_TARGET_PX. */
export const LAMP_TAP_RADIUS = MIN_TOUCH_TARGET_WORLD_RADIUS / TAP_PROXY_INRADIUS_RATIO;

/**
 * Hit-proxy radius of a river krathong, in MODEL units (inside the group scaled by RIVER_KRATHONG_SCALE). Derived only from existing
 * constants: the proxy's inscribed sphere projects to MIN_TOUCH_TARGET_PX at the default zoom (AC3, MFW-59), never smaller than the
 * model footprint. Proxies may overlap neighbours at minimum spacing; pickNearestRiverHitId resolves which krathong was tapped.
 */
export const RIVER_KRATHONG_TAP_RADIUS = Math.max(
  KRATHONG_MODEL_FOOTPRINT_RADIUS,
  MIN_TOUCH_TARGET_WORLD_RADIUS / TAP_PROXY_INRADIUS_RATIO / RIVER_KRATHONG_SCALE,
);

/** Remembers on this device that the scene-tap hint was dismissed. A UI flag, not a placement or personal data. */
export const SCENE_TAP_HINT_STORAGE_KEY = "mfw:sceneTapHintSeen:v1";
export const SCENE_TAP_HINT_SEEN_VALUE = "1";
/** DRAFT copy (spec silent; owner to review). */
export const SCENE_TAP_HINT_COPY = Object.freeze({
  scene3d: "แตะผิวน้ำ โคมไฟ หรือกระทง เพื่อเล่นได้เลย",
  flat2d: "แตะผิวน้ำหรือกระทง เพื่อเล่นได้เลย",
});
