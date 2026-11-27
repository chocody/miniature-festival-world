// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHRISTMAS_FRAME_VIEW_SIZE } from "./christmas.camera.config";
import { CHRISTMAS_TREE, TREE_MAX_BANDS, TREE_RADIUS_MAX } from "./christmas.tree.config";

const TIERS = [...CHRISTMAS_TREE.crownTiers, CHRISTMAS_TREE.skirtTier];
const slotCount = (rows: readonly { count: number }[]) => rows.reduce((sum, r) => sum + r.count, 0);

describe("CHRISTMAS_TREE config (MFW-93, DRAFT)", () => {
  it("CF1 crown and skirt templates", () => {
    expect(CHRISTMAS_TREE.crownTiers.map((t) => slotCount(t.rows))).toEqual([4, 7, 16, 22, 26]);
    expect(CHRISTMAS_TREE.crownTiers[4]).toBe(CHRISTMAS_TREE.skirtTier);
    expect(slotCount(CHRISTMAS_TREE.skirtTier.rows)).toBe(26);
    expect(CHRISTMAS_TREE.skirtTiersPerBand).toBe(3);
    expect(CHRISTMAS_TREE.maxBands).toBe(TREE_MAX_BANDS);
  });

  it("CF2 dyadic values keep every Y exact", () => {
    for (const v of [...TIERS.map((t) => t.height), CHRISTMAS_TREE.groundY, CHRISTMAS_TREE.trunkHeight]) {
      expect(Number.isInteger(v * 128), String(v)).toBe(true);
    }
    for (const r of TIERS.flatMap((t) => t.rows)) expect(Number.isInteger(r.heightRatio * 16), String(r.heightRatio)).toBe(true);
  });

  it("CF3 every row is valid", () => {
    for (const tier of TIERS) {
      tier.rows.forEach((r, i) => {
        expect(r.heightRatio).toBeGreaterThan(0);
        expect(r.heightRatio).toBeLessThan(1);
        if (i > 0) expect(r.heightRatio).toBeLessThan(tier.rows[i - 1].heightRatio);
        expect(Number.isInteger(r.count) && r.count >= 1).toBe(true);
        expect(r.angleOffsetDeg).toBeGreaterThanOrEqual(0);
        expect(r.angleOffsetDeg).toBeLessThan(360 / r.count);
      });
    }
  });

  it("CF4 every tier has a positive height and radii within TREE_RADIUS_MAX", () => {
    for (const t of TIERS) {
      expect(t.height).toBeGreaterThan(0);
      expect(t.topRadius).toBeGreaterThanOrEqual(0);
      expect(t.bottomRadius).toBeGreaterThanOrEqual(t.topRadius);
      expect(t.bottomRadius).toBeLessThanOrEqual(TREE_RADIUS_MAX);
    }
  });

  it("CF5 the tree fits the frame width", () => {
    expect(2 * TREE_RADIUS_MAX).toBeLessThan(CHRISTMAS_FRAME_VIEW_SIZE.width);
  });

  it("CF6 is frozen", () => {
    expect(Object.isFrozen(CHRISTMAS_TREE)).toBe(true);
    expect(Object.isFrozen(CHRISTMAS_TREE.crownTiers)).toBe(true);
    for (const t of TIERS) {
      expect(Object.isFrozen(t)).toBe(true);
      expect(Object.isFrozen(t.rows)).toBe(true);
      for (const r of t.rows) expect(Object.isFrozen(r)).toBe(true);
    }
  });
});
