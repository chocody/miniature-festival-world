// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BOUNCE_SETTLE_EPSILON,
  GIMMICK_BOUNCE,
  KRATHONG_MARK_CUE,
  LAMP_GLOW_LOOK,
  MS_PER_SECOND,
  RIPPLE_LOOK,
  LAMP_TAP_RADIUS,
  RIVER_KRATHONG_TAP_RADIUS,
  SCENE_TAP_HINT_COPY,
  SCENE_TAP_HINT_STORAGE_KEY,
  TAP_PROXY_INRADIUS_RATIO,
  WCAG_MAX_FLASHES_PER_SECOND,
  FIREWORK_LOOK,
  FIREWORK_MIN_LAUNCH_INTERVAL_MS,
  FIREWORK_SPARK_GEOMETRY,
  NO_BOUNCE,
  NUDGE_STYLE,
  NUDGE_TARGET_KINDS,
  REDUCED_MOTION_TAP_CUE,
  SCENE_GIMMICK_KINDS,
  SCENE_TAP_REACTIONS,
  SCENE_TARGET_KINDS,
  SKY_LANTERN_LOOK,
  TAP_BOUNCE_LOOKS,
  TAP_SHAKE_LOOKS,
  TAP_SHAKE_WIND,
  VILLAGER_TAP_HOP,
  WINDOW_GLOW_LOOK,
} from "./gimmicks.config";
import { RIVER_FOLIAGE_SWAY } from "./events/loyKrathong.river.config";
import { SCENE_CAMERA_ZOOM } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import {
  KRATHONG_MODEL_FOOTPRINT_RADIUS,
  RIVER_COLLISION_RADIUS,
  RIVER_KRATHONG_SCALE,
  RIVER_MIN_CENTER_SPACING,
} from "./riverFlow.config";
import { writeBounceAt } from "@/core/effects/gimmickCurves";

describe("gimmick config", () => {
  it("ripple look is sane", () => {
    expect(RIPPLE_LOOK.endRadius).toBeGreaterThan(RIPPLE_LOOK.startRadius);
    expect(RIPPLE_LOOK.startRadius).toBeGreaterThan(0);
    expect(RIPPLE_LOOK.ringInnerRatio).toBeGreaterThan(0);
    expect(RIPPLE_LOOK.ringInnerRatio).toBeLessThan(1);
    expect(Number.isInteger(RIPPLE_LOOK.ringSegments) && RIPPLE_LOOK.ringSegments >= 3).toBe(true);
    expect(RIPPLE_LOOK.durationMs).toBeGreaterThan(0);
  });
  it("lamp look is sane", () => {
    expect(LAMP_GLOW_LOOK.attackMs + LAMP_GLOW_LOOK.releaseMs).toBeLessThanOrEqual(LAMP_GLOW_LOOK.durationMs);
    expect(LAMP_GLOW_LOOK.flickerDepth).toBeGreaterThan(0);
    expect(LAMP_GLOW_LOOK.flickerDepth).toBeLessThan(1);
    expect(LAMP_GLOW_LOOK.durationMs).toBeGreaterThan(0);
  });
  it("flicker stays below the WCAG flash rate", () => {
    const minPeriod = MS_PER_SECOND / WCAG_MAX_FLASHES_PER_SECOND;
    expect(LAMP_GLOW_LOOK.flickerPeriodAMs).toBeGreaterThanOrEqual(minPeriod);
    expect(LAMP_GLOW_LOOK.flickerPeriodBMs).toBeGreaterThanOrEqual(minPeriod);
  });
  it("the bounce settles", () => {
    expect(GIMMICK_BOUNCE.amplitude * Math.exp(-GIMMICK_BOUNCE.durationMs / GIMMICK_BOUNCE.decayMs)).toBeLessThanOrEqual(BOUNCE_SETTLE_EPSILON);
    expect(GIMMICK_BOUNCE.amplitude).toBeGreaterThan(0);
    expect(GIMMICK_BOUNCE.amplitude).toBeLessThan(1);
  });
  it("colours are #rrggbb", () => {
    expect(RIPPLE_LOOK.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(LAMP_GLOW_LOOK.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  // MFW-59: replaces "tap radius covers the model and never overlaps a neighbour" (AC3 drops the no-overlap cap).
  it("tap proxies are at least MIN_TOUCH_TARGET_PX on screen", () => {
    const krathongPx = 2 * RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE * TAP_PROXY_INRADIUS_RATIO * SCENE_CAMERA_ZOOM;
    const lampPx = 2 * LAMP_TAP_RADIUS * TAP_PROXY_INRADIUS_RATIO * SCENE_CAMERA_ZOOM;
    expect(krathongPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
    expect(lampPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX - 1e-9);
  });
  it("the krathong proxy still covers the model", () => {
    expect(RIVER_KRATHONG_TAP_RADIUS).toBeGreaterThanOrEqual(KRATHONG_MODEL_FOOTPRINT_RADIUS);
  });
  it("TAP_PROXY_INRADIUS_RATIO is the icosahedron inradius ratio", () => {
    expect(TAP_PROXY_INRADIUS_RATIO).toBeCloseTo(0.7947, 4);
  });
  it("hint constants", () => {
    expect(SCENE_TAP_HINT_STORAGE_KEY).toMatch(/^mfw:[A-Za-z]+:v\d+$/);
    expect(SCENE_TAP_HINT_COPY.scene3d.length).toBeGreaterThan(0);
    expect(SCENE_TAP_HINT_COPY.flat2d.length).toBeGreaterThan(0);
  });
});

describe("natural look cues (MFW-67)", () => {
  it("mark cue is a slight, overlap-free size-up (MFW-67)", () => {
    expect(Object.isFrozen(KRATHONG_MARK_CUE)).toBe(true);
    expect(KRATHONG_MARK_CUE.scale).toBeGreaterThan(1);
    // A marked krathong next to a plain one at the minimum spacing does not touch it.
    expect(RIVER_COLLISION_RADIUS * (1 + KRATHONG_MARK_CUE.scale)).toBeLessThanOrEqual(RIVER_MIN_CENTER_SPACING + 1e-12);
  });

  it("the lamp light-up hugs the head (MFW-67)", () => {
    const out = { scale: 1, done: true };
    let minScale = Infinity;
    for (let t = 0; t <= GIMMICK_BOUNCE.durationMs; t++) minScale = Math.min(minScale, writeBounceAt(t, false, out).scale);
    expect(LAMP_GLOW_LOOK.shellScale * minScale).toBeGreaterThan(1); // stays outside the head
    expect(LAMP_GLOW_LOOK.shellScale - 1).toBeLessThan(GIMMICK_BOUNCE.amplitude); // a skin, not a halo
  });
});

describe("scene reactions (MFW-60)", () => {
  it("GC1: every SceneTargetKind has a reaction with ≥ 1 effect and a known gimmick", () => {
    expect(Object.keys(SCENE_TAP_REACTIONS).sort()).toEqual([...SCENE_TARGET_KINDS].sort());
    for (const kind of SCENE_TARGET_KINDS) {
      const r = SCENE_TAP_REACTIONS[kind];
      expect(r.effects.length, kind).toBeGreaterThan(0);
      expect(SCENE_GIMMICK_KINDS).toContain(r.gimmick);
      expect(Object.isFrozen(r)).toBe(true);
    }
    expect(Object.isFrozen(SCENE_TAP_REACTIONS)).toBe(true);
    expect(SCENE_TAP_REACTIONS.lamp.effects).toEqual(["lampGlow", "skyLantern"]);
    expect(SCENE_TAP_REACTIONS.sky.effects).toEqual(["firework"]);
  });

  it("GC2: 'nudge' is an effect exactly for the NUDGE_TARGET_KINDS, and NUDGE_STYLE covers them", () => {
    for (const kind of SCENE_TARGET_KINDS) {
      const nudges = SCENE_TAP_REACTIONS[kind].effects.includes("nudge");
      expect(nudges, kind).toBe((NUDGE_TARGET_KINDS as readonly string[]).includes(kind));
    }
    expect(Object.keys(NUDGE_STYLE).sort()).toEqual([...NUDGE_TARGET_KINDS].sort());
    expect(Object.keys(TAP_SHAKE_LOOKS).sort()).toEqual(NUDGE_TARGET_KINDS.filter((k) => NUDGE_STYLE[k] === "shake").sort());
    expect(Object.keys(TAP_BOUNCE_LOOKS).sort()).toEqual(NUDGE_TARGET_KINDS.filter((k) => NUDGE_STYLE[k] === "bounce").sort());
    expect(NUDGE_TARGET_KINDS.filter((k) => NUDGE_STYLE[k] === "hop")).toEqual(["villager"]);
  });

  it("GC3: the shake axis and the lantern drift follow the foliage wind; the launch interval is the WCAG rate", () => {
    const wind = RIVER_FOLIAGE_SWAY.leafClump;
    expect(TAP_SHAKE_WIND).toEqual({ windDirX: wind.windDirX, windDirZ: wind.windDirZ });
    expect({ x: SKY_LANTERN_LOOK.driftDirX, z: SKY_LANTERN_LOOK.driftDirZ }).toEqual({ x: wind.windDirX, z: wind.windDirZ });
    expect(FIREWORK_MIN_LAUNCH_INTERVAL_MS).toBe(1000 / 3);
  });

  it("GC4: looks are finite and > 0; palette entries are hex; no window flicker; reduced-motion cues are size-ups", () => {
    const positive = (o: object, label: string) => {
      for (const [k, v] of Object.entries(o)) if (typeof v === "number") expect(Number.isFinite(v) && v > 0, `${label}.${k}`).toBe(true);
    };
    for (const [k, look] of Object.entries(TAP_SHAKE_LOOKS)) positive(look, k);
    positive(TAP_BOUNCE_LOOKS.pier, "pier");
    positive(VILLAGER_TAP_HOP, "hop");
    const { flickerDepth, ...windowRest } = WINDOW_GLOW_LOOK;
    positive(windowRest, "window");
    expect(flickerDepth).toBe(0);
    const { palette, ...fireworkRest } = FIREWORK_LOOK;
    positive(fireworkRest, "firework");
    expect(palette.length).toBeGreaterThan(1);
    for (const hex of palette) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    const { geometry, driftDirZ, flameOffsetY, ...lanternRest } = SKY_LANTERN_LOOK;
    positive(lanternRest, "lantern");
    expect(flameOffsetY).toBeLessThan(0); // the flame hangs under the opening
    expect(SKY_LANTERN_LOOK.flameColor).toMatch(/^#[0-9a-f]{6}$/i);
    positive(geometry, "lantern geometry");
    expect(driftDirZ).toBe(0);
    expect(SKY_LANTERN_LOOK.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SKY_LANTERN_LOOK.fadeStartRatio).toBeLessThan(1);
    for (const k of NUDGE_TARGET_KINDS) expect(REDUCED_MOTION_TAP_CUE.scale[k], k).toBeGreaterThan(1);
    expect(REDUCED_MOTION_TAP_CUE.holdMs).toBeGreaterThan(0);
    expect(WINDOW_GLOW_LOOK.attackMs + WINDOW_GLOW_LOOK.releaseMs).toBeLessThanOrEqual(WINDOW_GLOW_LOOK.durationMs);
    expect(WINDOW_GLOW_LOOK.shellScale - 1).toBeLessThan(0.5); // a skin, not a halo
    expect(NO_BOUNCE.durationMs).toBe(0);
    expect(FIREWORK_SPARK_GEOMETRY.radius).toBe(1);
  });

  it("the shakes settle and the bounces settle at their duration", () => {
    for (const look of Object.values(TAP_SHAKE_LOOKS)) {
      expect(look.shear * Math.exp(-look.durationMs / look.decayMs)).toBeLessThan(look.shear * 0.1);
    }
    for (const look of Object.values(TAP_BOUNCE_LOOKS)) {
      expect(look.amplitude * Math.exp(-look.durationMs / look.decayMs)).toBeLessThanOrEqual(BOUNCE_SETTLE_EPSILON);
    }
  });

  it("the MFW-60 hint copy says anything in the 3D scene can be tapped (Thai, DRAFT)", () => {
    expect(SCENE_TAP_HINT_COPY.scene3d).toBe("แตะอะไรก็ได้ในฉาก เพื่อเล่นได้เลย");
  });
});
