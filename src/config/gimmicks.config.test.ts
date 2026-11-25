// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BOUNCE_SETTLE_EPSILON,
  GIMMICK_BOUNCE,
  LAMP_GLOW_LOOK,
  MS_PER_SECOND,
  RIPPLE_LOOK,
  LAMP_TAP_RADIUS,
  RIVER_KRATHONG_TAP_RADIUS,
  SCENE_TAP_HINT_COPY,
  SCENE_TAP_HINT_STORAGE_KEY,
  TAP_PROXY_INRADIUS_RATIO,
  WCAG_MAX_FLASHES_PER_SECOND,
} from "./gimmicks.config";
import { SCENE_CAMERA_ZOOM } from "./camera.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE } from "./riverFlow.config";

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
