import { describe, expect, it } from "vitest";
import { CAMERA_FLIGHT_OFFSET } from "./camera.config";
import * as cfg from "./fallback2d.config";
import { MIN_TOUCH_TARGET_PX } from "./customizer.config";
import { KRATHONG_MARK_CUE, MS_PER_SECOND, RIVER_KRATHONG_TAP_RADIUS } from "./gimmicks.config";
import { EFFECT_POOL_CAPS, FALLBACK_2D_EFFECT_POOL_CAPS, LIVING_WORLD_TIERS } from "./performance.config";
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

  it("derives sprite, tap, mark and frame constants from their formulas", () => {
    expect(cfg.FLAT_RIVER_SPRITE_SCALE).toBe(RIVER_KRATHONG_SCALE);
    expect(cfg.FLAT_RIVER_TAP_RADIUS).toBe(RIVER_KRATHONG_TAP_RADIUS * RIVER_KRATHONG_SCALE);
    expect(cfg.FLAT_RIVER_FRAME_INTERVAL_MS).toBe(MS_PER_SECOND / cfg.FLAT_RIVER_TARGET_FPS);
    expect(cfg.FLAT_RIVER_MARK_SCALE).toBe(KRATHONG_MARK_CUE.scale);
  });

  it("pools FALLBACK_2D effects with the LOW caps", () => {
    expect(FALLBACK_2D_EFFECT_POOL_CAPS).toEqual(EFFECT_POOL_CAPS.LOW);
  });

  it("keeps the placeholders finite and positive", () => {
    for (const v of [
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

  it("uses non-empty copy and frozen objects", () => {
    for (const t of Object.values(cfg.FLAT_VIEW_COPY)) expect(t.length).toBeGreaterThan(0);
    for (const o of [
      cfg.FLAT_KRATHONG_PREVIEW_VIEW,
      cfg.FLAT_VIEW_COPY,
      cfg.FLAT_KRATHONG_VEIN,
      cfg.FLAT_SPHERE_HIGHLIGHT,
    ]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });

  it("MFW-51 look constants: finite positive DRAFT members, integer technical counts", () => {
    for (const o of [cfg.FLAT_KRATHONG_VEIN, cfg.FLAT_SPHERE_HIGHLIGHT]) {
      expect(Object.isFrozen(o)).toBe(true);
      for (const v of Object.values(o)) expect(Number.isFinite(v) && v > 0).toBe(true);
    }
    for (const n of [cfg.FLAT_LATHE_SILHOUETTE_SEGMENTS, cfg.FLAT_PATH_DECIMALS, cfg.FLAT_SHORE_BAND_STEPS]) {
      expect(Number.isInteger(n) && n >= 1).toBe(true);
    }
    expect(Number.isInteger(cfg.FLAT_BLOB_GRADIENT_STOPS) && cfg.FLAT_BLOB_GRADIENT_STOPS >= 2).toBe(true);
  });

  it("FALLBACK_2D shows the LOW living world: its villager count, standing (MFW-51)", () => {
    expect(cfg.FLAT_RIVER_VILLAGER_COUNT).toBe(LIVING_WORLD_TIERS.LOW.villagerCount);
    expect(LIVING_WORLD_TIERS.LOW.villagersWalk).toBe(false);
  });
});
