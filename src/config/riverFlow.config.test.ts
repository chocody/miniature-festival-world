// @vitest-environment node
import { describe, expect, it } from "vitest";
import { KRATHONG_BASE_MODELS, KRATHONG_LEAF_MODELS, type PrimitiveGeometrySpec, type Vec3Tuple } from "./krathongModel.config";
import * as cfg from "./riverFlow.config";
import { SPEED_FACTOR_MAX } from "@/core/coordinates";

function radiusOf(g: PrimitiveGeometrySpec, scale: Vec3Tuple): number {
  switch (g.type) {
    case "cylinder": return Math.max(g.radiusTop, g.radiusBottom) * scale[0];
    case "sphere": return g.radius * Math.max(scale[0], scale[2]);
    case "cone": return g.radius * Math.max(scale[0], scale[2]);
  }
}

describe("riverFlow config", () => {
  it("has sane bobbing values", () => {
    for (const a of [cfg.RIVER_BOB_HEAVE_AMPLITUDE, cfg.RIVER_BOB_PITCH_AMPLITUDE_RAD, cfg.RIVER_BOB_ROLL_AMPLITUDE_RAD]) {
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
    }
    for (const p of [cfg.RIVER_BOB_HEAVE_PERIOD_MS, cfg.RIVER_BOB_PITCH_PERIOD_MS, cfg.RIVER_BOB_ROLL_PERIOD_MS]) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThan(0);
    }
  });

  it("has sane scale, speed and search resolution", () => {
    expect(cfg.RIVER_KRATHONG_SCALE).toBeGreaterThan(0);
    expect(cfg.RIVER_DRIFT_SPEED_FACTOR).toBeGreaterThan(0);
    expect(cfg.RIVER_DRIFT_SPEED_FACTOR).toBeLessThanOrEqual(SPEED_FACTOR_MAX);
    expect(Number.isInteger(cfg.RIVER_SPOT_SEARCH_STEPS_PER_SPACING)).toBe(true);
    expect(cfg.RIVER_SPOT_SEARCH_STEPS_PER_SPACING).toBeGreaterThanOrEqual(1);
  });

  it("derived constants match their formulas", () => {
    expect(cfg.RIVER_COLLISION_RADIUS).toBe(cfg.KRATHONG_MODEL_FOOTPRINT_RADIUS * cfg.RIVER_KRATHONG_SCALE);
    expect(cfg.RIVER_MIN_CENTER_SPACING).toBe(2 * cfg.RIVER_COLLISION_RADIUS * cfg.RIVER_COLLISION_CURVATURE_MARGIN);
    expect(cfg.RIVER_COLLISION_CURVATURE_MARGIN).toBeGreaterThanOrEqual(1);
  });

  it("the footprint covers the krathong model", () => {
    for (const base of Object.values(KRATHONG_BASE_MODELS)) {
      expect(radiusOf(base.geometry, base.scale)).toBeLessThanOrEqual(cfg.KRATHONG_MODEL_FOOTPRINT_RADIUS);
      for (const leaf of Object.values(KRATHONG_LEAF_MODELS)) {
        expect(base.rimRadius + radiusOf(leaf.geometry, leaf.scale)).toBeLessThanOrEqual(cfg.KRATHONG_MODEL_FOOTPRINT_RADIUS);
      }
    }
  });
});
