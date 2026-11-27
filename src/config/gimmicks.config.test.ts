// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BOUNCE_SETTLE_EPSILON,
  CHIMNEY_SMOKE_LOOK,
  FALLING_LEAF_LOOK,
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
  LAMP_GROUND_LIGHT_LOOK,
  SKY_LAUNCH_GIMMICKS,
  SKY_LAUNCH_KINDS,
  SKY_LAUNCH_SEED,
  SKY_LAUNCH_SEED_GLOBAL_NAME,
  SKY_LAUNCH_SPLIT,
} from "./gimmicks.config";
import { BLOB_SHADOW_LOOK } from "./look.config";
import { createSeededRandom, pickSkyLaunch } from "@/core/effects/seededRandom";
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
import { buildLeafShellMeshData } from "@/core/customization/krathongMeshData";
import { LIGHT_PRESET_IDS } from "./look.config";

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
    // MFW-75: a lamp tap only lights the lamp; the sky tap launches a firework or a sky lantern (skyLaunch).
    expect(SCENE_TAP_REACTIONS.lamp.effects).toEqual(["lampGlow"]);
    expect(SCENE_TAP_REACTIONS.sky.effects).toEqual(["skyLaunch"]);
    // MFW-72 (slice 2): smoke with the house lights, falling leaves with the tree shake; the villager keeps the hop.
    expect(SCENE_TAP_REACTIONS.house.effects).toEqual(["windowGlow", "chimneySmoke"]);
    expect(SCENE_TAP_REACTIONS.tree.effects).toEqual(["nudge", "fallingLeaves"]);
    expect(SCENE_TAP_REACTIONS.villager.effects).toEqual(["nudge"]);
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

describe("scene reactions part 2 (MFW-72)", () => {
  const positive = (o: object, label: string) => {
    for (const [k, v] of Object.entries(o)) if (typeof v === "number") expect(Number.isFinite(v) && v > 0, `${label}.${k}`).toBe(true);
  };

  it("GC5: smoke and leaf looks are finite and > 0, the smoke grows then fades, palettes are #rrggbb per light preset", () => {
    positive(CHIMNEY_SMOKE_LOOK, "smoke");
    positive(CHIMNEY_SMOKE_LOOK.geometry, "smoke geometry");
    expect(CHIMNEY_SMOKE_LOOK.fadeStartRatio).toBeLessThan(1);
    expect(CHIMNEY_SMOKE_LOOK.endRadius).toBeGreaterThan(CHIMNEY_SMOKE_LOOK.startRadius);
    expect(CHIMNEY_SMOKE_LOOK.geometry.kind).toBe("icosahedron");
    expect(CHIMNEY_SMOKE_LOOK.geometry.detail).toBeGreaterThanOrEqual(1); // a round blob, not a faceted 20-face shape
    positive(FALLING_LEAF_LOOK, "leaf");
    for (const look of [CHIMNEY_SMOKE_LOOK, FALLING_LEAF_LOOK]) {
      expect(Object.isFrozen(look)).toBe(true);
      expect(Object.keys(look.palette).sort()).toEqual([...LIGHT_PRESET_IDS].sort());
      for (const id of LIGHT_PRESET_IDS) {
        expect(look.palette[id].length).toBeGreaterThan(0);
        for (const hex of look.palette[id]) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    expect(FALLING_LEAF_LOOK.flightPitchRad).toBeGreaterThan(FALLING_LEAF_LOOK.tiltAmplitudeRad); // pitched up all the way down
    expect(FALLING_LEAF_LOOK.flightPitchRad).toBeLessThan(Math.PI / 2);
    expect(CHIMNEY_SMOKE_LOOK.minElevationSin).toBeLessThan(1);
    expect(FALLING_LEAF_LOOK.shell.length).toBe(1); // unit length: the instance scale is FALLING_LEAF_LOOK.length
    const data = buildLeafShellMeshData(FALLING_LEAF_LOOK.shell);
    expect(data.triangleCount).toBeGreaterThan(0);
    expect(data.indices.length).toBe(3 * data.triangleCount);
  });
});

describe("lamp light and sky launch (MFW-75)", () => {
  const firstTwoPicks = (seed: number) => {
    const r = createSeededRandom(seed);
    return [pickSkyLaunch(r(), SKY_LAUNCH_SPLIT.fireworkShare), pickSkyLaunch(r(), SKY_LAUNCH_SPLIT.fireworkShare)];
  };

  it("CF1: the lamp tap only lights the lamp; only the sky entry starts skyLaunch", () => {
    expect(SCENE_TAP_REACTIONS.lamp.effects).toEqual(["lampGlow"]);
    expect(SCENE_TAP_REACTIONS.lamp.gimmick).toBe("lamp-glow");
    for (const kind of SCENE_TARGET_KINDS) {
      expect(SCENE_TAP_REACTIONS[kind].effects.includes("skyLaunch"), kind).toBe(kind === "sky");
    }
  });

  it("CF2: the ground light is a soft, faint warm patch above the blob shadows", () => {
    const L = LAMP_GROUND_LIGHT_LOOK;
    expect(L.radius).toBeGreaterThan(0);
    expect(L.opacity).toBeGreaterThan(0);
    expect(L.opacity).toBeLessThanOrEqual(1);
    expect(L.falloffExponent).toBeGreaterThan(BLOB_SHADOW_LOOK.falloffExponent); // a softer rim than a blob
    expect(L.liftY).toBeGreaterThan(BLOB_SHADOW_LOOK.liftY);
    expect(L.color).toBe(LAMP_GLOW_LOOK.color);
    expect(Object.isFrozen(L)).toBe(true);
  });

  it("CF3: the sky tap starts skyLaunch; every launch kind maps to a known gimmick", () => {
    expect(SCENE_TAP_REACTIONS.sky.effects).toEqual(["skyLaunch"]);
    expect([...SKY_LAUNCH_KINDS]).toEqual(["firework", "skyLantern"]);
    expect(Object.keys(SKY_LAUNCH_GIMMICKS).sort()).toEqual([...SKY_LAUNCH_KINDS].sort());
    for (const g of Object.values(SKY_LAUNCH_GIMMICKS)) expect(SCENE_GIMMICK_KINDS).toContain(g);
    expect(SKY_LAUNCH_GIMMICKS).toEqual({ firework: "firework", skyLantern: "sky-lantern" });
    expect(Object.isFrozen(SKY_LAUNCH_GIMMICKS)).toBe(true);
  });

  it("CF4: SKY_LAUNCH_SEED is the smallest positive integer whose first two picks are firework, then sky lantern", () => {
    expect(Number.isSafeInteger(SKY_LAUNCH_SEED) && SKY_LAUNCH_SEED > 0).toBe(true);
    expect(firstTwoPicks(SKY_LAUNCH_SEED)).toEqual(["firework", "skyLantern"]);
    for (let s = 1; s < SKY_LAUNCH_SEED; s++) expect(firstTwoPicks(s), String(s)).not.toEqual(["firework", "skyLantern"]);
    expect(SKY_LAUNCH_SEED_GLOBAL_NAME).toMatch(/^__MFW_[A-Z_]+__$/);
  });

  it("CF5: both kinds are reachable (0 < fireworkShare < 1)", () => {
    expect(SKY_LAUNCH_SPLIT.fireworkShare).toBeGreaterThan(0);
    expect(SKY_LAUNCH_SPLIT.fireworkShare).toBeLessThan(1);
    expect(Object.isFrozen(SKY_LAUNCH_SPLIT)).toBe(true);
  });
});
