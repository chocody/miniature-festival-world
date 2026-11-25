import { describe, expect, it } from "vitest";
import { CAMERA_FLIGHT_OFFSET, HIGHLIGHT_RING_SIZES } from "./camera.config";
import * as cfg from "./fallback2d.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { MS_PER_SECOND, RIVER_KRATHONG_TAP_RADIUS } from "./gimmicks.config";
import { EFFECT_POOL_CAPS, FALLBACK_2D_EFFECT_POOL_CAPS } from "./performance.config";
import { RIVER_KRATHONG_SCALE } from "./riverFlow.config";

describe("fallback2d.config", () => {
  it("2D tap radius floor", () => {
    expect(cfg.FLAT_MIN_TAP_RADIUS_PX).toBe(MIN_TOUCH_TARGET_PX / 2);
  });

  it("derives the view angles from the 3D camera offset", () => {
    expect(cfg.FLAT_KRATHONG_VIEW_AZIMUTH_RAD).toBe(Math.atan2(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2]));
    expect(cfg.FLAT_KRATHONG_VIEW_ELEVATION_RAD).toBe(
      Math.atan2(CAMERA_FLIGHT_OFFSET[1], Math.hypot(CAMERA_FLIGHT_OFFSET[0], CAMERA_FLIGHT_OFFSET[2])),
    );
  });

  it("derives sprite, tap, highlight and frame constants from their formulas", () => {
    expect(cfg.FLAT_RIVER_SPRITE_SCALE).toBe(RIVER_KRATHONG_SCALE);
    expect(cfg.FLAT_RIVER_TAP_RADIUS).toBe(RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE);
    expect(cfg.FLAT_RIVER_FRAME_INTERVAL_MS).toBe(MS_PER_SECOND / cfg.FLAT_RIVER_TARGET_FPS);
    expect(cfg.FLAT_RIVER_HIGHLIGHT.innerRadius).toBe(HIGHLIGHT_RING_SIZES.krathong.innerRadius * RIVER_KRATHONG_SCALE);
    expect(cfg.FLAT_RIVER_HIGHLIGHT.outerRadius).toBe(HIGHLIGHT_RING_SIZES.krathong.outerRadius * RIVER_KRATHONG_SCALE);
  });

  it("pools FALLBACK_2D effects with the LOW caps", () => {
    expect(FALLBACK_2D_EFFECT_POOL_CAPS).toEqual(EFFECT_POOL_CAPS.LOW);
  });

  it("keeps the placeholders finite and positive", () => {
    for (const v of [
      cfg.FLAT_KRATHONG_SIDE_SHADE,
      cfg.FLAT_KRATHONG_PREVIEW_VIEW.halfExtent,
      cfg.FLAT_KRATHONG_PREVIEW_VIEW.centerLift,
      cfg.FLAT_RIVER_VIEW_HEIGHT_PX,
      cfg.FLAT_RIVER_VISIBLE_BANK_DEPTH,
      cfg.FLAT_RIVER_TARGET_FPS,
      cfg.CYLINDRICAL_QUADRANT_EPSILON,
    ]) {
      expect(Number.isFinite(v) && v > 0).toBe(true);
    }
    expect(cfg.FLAT_RIVER_PADDING_PX).toBeGreaterThanOrEqual(0);
    expect(cfg.FLAT_RIVER_END_MARGIN_PROGRESS).toBeGreaterThan(0);
    expect(cfg.FLAT_RIVER_END_MARGIN_PROGRESS).toBeLessThan(0.5);
  });

  it("uses #RRGGBB colours, non-empty copy and frozen objects", () => {
    for (const c of Object.values(cfg.FLAT_VIEW_COLORS)) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    for (const t of Object.values(cfg.FLAT_VIEW_COPY)) expect(t.length).toBeGreaterThan(0);
    for (const o of [
      cfg.FLAT_KRATHONG_PREVIEW_VIEW,
      cfg.FLAT_RIVER_HIGHLIGHT,
      cfg.FLAT_RIVER_PROP_SIZES,
      cfg.FLAT_VIEW_COLORS,
      cfg.FLAT_VIEW_COPY,
    ]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });
});
