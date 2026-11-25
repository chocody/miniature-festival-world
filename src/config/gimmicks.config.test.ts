// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BOUNCE_SETTLE_EPSILON,
  GIMMICK_BOUNCE,
  LAMP_GLOW_LOOK,
  MS_PER_SECOND,
  RIPPLE_LOOK,
  RIVER_KRATHONG_TAP_RADIUS,
  WCAG_MAX_FLASHES_PER_SECOND,
} from "./gimmicks.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS, RIVER_KRATHONG_SCALE, RIVER_MIN_CENTER_SPACING } from "./riverFlow.config";

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
  it("tap radius covers the model and never overlaps a neighbour", () => {
    expect(RIVER_KRATHONG_TAP_RADIUS).toBeGreaterThanOrEqual(KRATHONG_MODEL_FOOTPRINT_RADIUS);
    expect(2 * RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE).toBeLessThanOrEqual(RIVER_MIN_CENTER_SPACING + 1e-12);
  });
});
