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
/**
 * DRAFT copy (spec silent; owner to review). scene3d since MFW-60: every object of the 3D scene answers a tap, so the hint says
 * "anything" (loop decision, not yet reviewed by the owner).
 */
export const SCENE_TAP_HINT_COPY = Object.freeze({
  scene3d: "แตะอะไรก็ได้ในฉาก เพื่อเล่นได้เลย",
});

/*
 * MFW-60 (backlog 11.4, slice 1): scene reactions. Owner decisions (open questions 35 and 41, 2026-11-25): "อยาก interact อะไรก็ได้เลย"
 * (anything in the scene answers a tap) and "กดท้องฟ้าแล้วมีการจุดพลุ" (a sky tap launches a firework). How they are built and every
 * number below is a loop decision, not yet reviewed by the owner; values marked DRAFT are listed in docs/follow-ups.md (MFW-60).
 */

/** Every visible object type of the scene that answers a tap (owner, 2026-11-25: "อยาก interact อะไรก็ได้เลย", open question 41). */
export const SCENE_TARGET_KINDS = [
  "house",
  "tree",
  "bush",
  "reed",
  "rock",
  "pier",
  "villager",
  "lamp",
  "water",
  "krathong",
  "sky",
] as const;
export type SceneTargetKind = (typeof SCENE_TARGET_KINDS)[number];
/** Targets whose own meshes move on a tap (the pooled "nudge"). */
export const NUDGE_TARGET_KINDS = ["tree", "bush", "reed", "rock", "pier", "villager"] as const;
export type NudgeTargetKind = (typeof NUDGE_TARGET_KINDS)[number];

/** Values written to the scene section's data-last-gimmick (e2e). The first three existed before MFW-60. */
export const SCENE_GIMMICK_KINDS = [
  "ripple",
  "lamp-glow",
  "inspect",
  "firework",
  "house-lights",
  "tree-shake",
  "bush-shake",
  "reed-shake",
  "rock-bounce",
  "pier-bounce",
  "villager-hop",
] as const;
export type SceneGimmickKind = (typeof SCENE_GIMMICK_KINDS)[number];

/** Pooled effects a reaction can start (SceneEffectsHandle.react). markCue is the existing krathong inspect cue (RiverFlow / OwnKrathong). */
export type SceneEffectId = "ripple" | "lampGlow" | "skyLantern" | "windowGlow" | "nudge" | "firework" | "markCue";
export interface SceneTapReaction {
  readonly gimmick: SceneGimmickKind;
  readonly effects: readonly SceneEffectId[]; // non-empty
}
/**
 * THE registry: one reaction per object type (open question 35, owner 2026-11-25; slice 1 of MFW-60). The krathong entry is served
 * by RiverFlow / OwnKrathong and the inspect popup; SceneEffectsHandle.react() never handles it. Slice 2 (MFW-72) adds chimney smoke
 * and falling leaves.
 */
export const SCENE_TAP_REACTIONS: Readonly<Record<SceneTargetKind, SceneTapReaction>> = Object.freeze({
  house: Object.freeze({ gimmick: "house-lights", effects: Object.freeze(["windowGlow"] as const) }),
  tree: Object.freeze({ gimmick: "tree-shake", effects: Object.freeze(["nudge"] as const) }),
  bush: Object.freeze({ gimmick: "bush-shake", effects: Object.freeze(["nudge"] as const) }),
  reed: Object.freeze({ gimmick: "reed-shake", effects: Object.freeze(["nudge"] as const) }),
  rock: Object.freeze({ gimmick: "rock-bounce", effects: Object.freeze(["nudge"] as const) }),
  pier: Object.freeze({ gimmick: "pier-bounce", effects: Object.freeze(["nudge"] as const) }),
  villager: Object.freeze({ gimmick: "villager-hop", effects: Object.freeze(["nudge"] as const) }),
  lamp: Object.freeze({ gimmick: "lamp-glow", effects: Object.freeze(["lampGlow", "skyLantern"] as const) }),
  water: Object.freeze({ gimmick: "ripple", effects: Object.freeze(["ripple"] as const) }),
  krathong: Object.freeze({ gimmick: "inspect", effects: Object.freeze(["markCue"] as const) }),
  sky: Object.freeze({ gimmick: "firework", effects: Object.freeze(["firework"] as const) }),
} satisfies Record<SceneTargetKind, SceneTapReaction>);

/** How a "nudge" moves each object type. */
export const NUDGE_STYLE: Readonly<Record<NudgeTargetKind, "shake" | "bounce" | "hop">> = Object.freeze({
  tree: "shake",
  bush: "shake",
  reed: "shake",
  rock: "bounce",
  pier: "bounce",
  villager: "hop",
});
export interface ShakeLook {
  readonly shear: number;
  readonly periodMs: number;
  readonly decayMs: number;
  readonly durationMs: number;
}
/** Foliage shake: extra horizontal shear k(t) = shear·e^(−t/decay)·sin(2πt/period), same pivot and axis as the MFW-70 sway. DRAFT. */
export const TAP_SHAKE_LOOKS: Readonly<Record<"tree" | "bush" | "reed", ShakeLook>> = Object.freeze({
  tree: Object.freeze({ shear: 0.45, periodMs: 360, decayMs: 600, durationMs: 1_800 }),
  bush: Object.freeze({ shear: 0.55, periodMs: 320, decayMs: 550, durationMs: 1_600 }),
  reed: Object.freeze({ shear: 0.8, periodMs: 300, decayMs: 500, durationMs: 1_500 }),
});
/**
 * Shake axis when the sway is off (LOW tier; under reduced motion there is no shake, only the size-up). Equals the
 * RIVER_FOLIAGE_SWAY.leafClump wind (pinned by gimmicks.config.test.ts; not imported, to keep this config free of the river config).
 */
export const TAP_SHAKE_WIND = Object.freeze({ windDirX: 1, windDirZ: 0 });
/** Rock / pier bounce: uniform scale about the object's own origin. Rock reuses GIMMICK_BOUNCE; the long pier deck bounces less. DRAFT. */
export const TAP_BOUNCE_LOOKS = Object.freeze({
  rock: GIMMICK_BOUNCE,
  pier: Object.freeze({ ...GIMMICK_BOUNCE, amplitude: 0.04 }),
});
/** Villager hop: liftY = heightScale · villager scale · 4u(1−u), u = t / durationMs (one hop). DRAFT. */
export const VILLAGER_TAP_HOP = Object.freeze({ heightScale: 0.12, durationMs: 420 });
/** Reduced motion (invariant F, AC4): no motion, a steady size-up held for holdMs, then off. DRAFT. */
export const REDUCED_MOTION_TAP_CUE = Object.freeze({
  holdMs: 700,
  scale: Object.freeze({ tree: 1.12, bush: 1.14, reed: 1.16, rock: 1.12, pier: 1.03, villager: 1.1 } satisfies Record<
    NudgeTargetKind,
    number
  >),
});

/** House window light-up: an additive skin over each window of the tapped house (like LAMP_GLOW_LOOK; no flicker, no bounce). DRAFT. */
export const WINDOW_GLOW_LOOK = Object.freeze({
  color: "#FFB347", // warmer than the lamp glow so lit windows read on the pale DAY walls too
  peakIntensity: 1.6, // > 1: colour channels saturate to a bright warm pane (toneMapped false)
  shellScale: 1.35, // × window box: a thin skin (0.021 world units of overhang), not a halo (MFW-67)
  durationMs: 2_400,
  attackMs: LAMP_GLOW_LOOK.attackMs,
  releaseMs: 700,
  flickerDepth: 0,
  flickerPeriodAMs: LAMP_GLOW_LOOK.flickerPeriodAMs,
  flickerPeriodBMs: LAMP_GLOW_LOOK.flickerPeriodBMs,
});
/** A bounce that is already over at t = 0 (the window glow does not bounce). Technical. */
export const NO_BOUNCE = Object.freeze({ ...GIMMICK_BOUNCE, durationMs: 0 });

/**
 * Firework: a shell (with a short trail) rises from the tapped land point, then sparks burst outward, sag and shrink to nothing.
 * Every spark is drawn as a head and a smaller tail nearer the centre, so the burst reads as radial streaks. NormalBlending, unlit
 * (it fades by shrinking: no additive halo). Sized from screenshots at the MFW-68 framing (zoom 66.7–143). DRAFT.
 */
export const FIREWORK_LOOK = Object.freeze({
  shellRiseMs: 750,
  burstMs: 2_000,
  burstHeight: 2.6, // world units above the launch point
  burstRadius: 1.3,
  sagDistance: 0.6, // spark drop at the end of the burst
  sparkSize: 0.1, // world radius of a spark head at the burst
  sparkTailRatio: 0.6, // the tail sits at this share of the head's distance from the centre
  sparkTailSize: 0.65, // tail size / head size
  shellSize: 0.08,
  shellTrailCount: 2, // dots under the rising shell
  shellTrailSpacing: 0.2, // world units between them
  reducedMotionHoldMs: 900, // static starburst, then gone
  palette: Object.freeze(["#FFC93C", "#FF5C9A", "#4FC8FF", "#B98CFF", "#FFF1C4"]), // gold, pink, sky, lilac, warm white
});
/** WCAG 2.3.1: launches closer than this are ignored, so bursts never exceed 3 per second. Derived from the standard, not a product number. */
export const FIREWORK_MIN_LAUNCH_INTERVAL_MS = MS_PER_SECOND / WCAG_MAX_FLASHES_PER_SECOND;
/** Unit icosahedron for sparks and the shell (scaled per instance). Technical. */
export const FIREWORK_SPARK_GEOMETRY = Object.freeze({ kind: "icosahedron", radius: 1, detail: 0 } as const);

/**
 * Sky lantern (โคมลอย) released from a tapped lamp head: a warm paper lantern with a small bright flame under its opening rises,
 * drifts downwind, sways, then shrinks away. NormalBlending, unlit. Sized from screenshots at the MFW-68 framing. DRAFT.
 */
export const SKY_LANTERN_LOOK = Object.freeze({
  color: LAMP_GLOW_LOOK.color,
  geometry: Object.freeze({ kind: "cylinder", radiusTop: 0.18, radiusBottom: 0.135, height: 0.3, radialSegments: 6 } as const),
  flameColor: "#FFF4C2",
  flameScale: 0.35, // × the lantern
  flameOffsetY: -0.55, // × the lantern height: just under the opening
  riseHeight: 3.2,
  driftDistance: 0.6,
  driftDirX: 1, // = RIVER_FOLIAGE_SWAY.leafClump wind (pinned by test)
  driftDirZ: 0,
  swayAmplitude: 0.05,
  swayPeriodMs: 2_000,
  durationMs: 6_000,
  fadeStartRatio: 0.7, // the size shrinks to 0 over the last 30 %
  reducedMotionOffsetY: 0.8, // static lantern this high above the lamp head
  reducedMotionHoldMs: 1_600,
});
