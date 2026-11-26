import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUALITY_TIER,
  EFFECT_KINDS,
  EFFECT_POOL_CAPS,
  ENVIRONMENT_RENDER_BUDGETS,
  KRATHONG_RIPPLE_MAX_TRIANGLES,
  FALLBACK_FPS_THRESHOLD,
  FOLIAGE_TIERS,
  FPS_SAMPLE_WINDOW_MS,
  FPS_STALL_GAP_MS,
  FPS_SUSTAIN_MS,
  FPS_WARMUP_MS,
  HIGH_TIER_MIN_DEVICE_MEMORY_GB,
  HIGH_TIER_MIN_HARDWARE_CONCURRENCY,
  LOW_TIER_MAX_DEVICE_MEMORY_GB,
  LOW_TIER_MAX_HARDWARE_CONCURRENCY,
  STEP_DOWN_FPS_THRESHOLD,
  TIER_ANTIALIAS,
  TIER_BUDGETS,
  TIER_SETTLE_MS,
  WATER_EFFECT_TIERS,
} from "./performance.config";
import { ZONE_ITEM_CAP } from "./world.config";

describe("performance.config (owner numbers, open question #5)", () => {
  it("has the owner thresholds", () => {
    expect(FALLBACK_FPS_THRESHOLD).toBe(20);
    expect(STEP_DOWN_FPS_THRESHOLD).toEqual({ HIGH: 45, MEDIUM: 30, LOW: null });
    expect(FPS_SUSTAIN_MS).toBe(5000);
    expect(FPS_WARMUP_MS).toBe(2000);
    expect(HIGH_TIER_MIN_DEVICE_MEMORY_GB).toBe(8);
    expect(HIGH_TIER_MIN_HARDWARE_CONCURRENCY).toBe(8);
    expect(LOW_TIER_MAX_DEVICE_MEMORY_GB).toBe(3);
    expect(LOW_TIER_MAX_HARDWARE_CONCURRENCY).toBe(4);
  });
  it("has the owner budgets, frozen", () => {
    expect(TIER_BUDGETS).toEqual({
      HIGH: { pixelRatioCap: 2, shadows: true, maxTextureSize: 2048, riverItemCap: 80, riverItemCastShadow: true },
      MEDIUM: { pixelRatioCap: 1.5, shadows: false, maxTextureSize: 1024, riverItemCap: 48, riverItemCastShadow: false },
      LOW: { pixelRatioCap: 1, shadows: false, maxTextureSize: 512, riverItemCap: 24, riverItemCastShadow: false },
    });
    expect(Object.isFrozen(TIER_BUDGETS)).toBe(true);
    expect(Object.isFrozen(TIER_BUDGETS.HIGH)).toBe(true);
    expect(Object.isFrozen(STEP_DOWN_FPS_THRESHOLD)).toBe(true);
  });
  it("river budget (lead PLACEHOLDER, MFW-25)", () => {
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      const cap = TIER_BUDGETS[tier].riverItemCap;
      expect(Number.isSafeInteger(cap)).toBe(true);
      expect(cap).toBeGreaterThanOrEqual(1);
      expect(cap).toBeLessThanOrEqual(ZONE_ITEM_CAP);
    }
    expect(TIER_BUDGETS.HIGH.riverItemCap).toBeGreaterThanOrEqual(TIER_BUDGETS.MEDIUM.riverItemCap);
    expect(TIER_BUDGETS.MEDIUM.riverItemCap).toBeGreaterThanOrEqual(TIER_BUDGETS.LOW.riverItemCap);
    expect(TIER_BUDGETS.LOW.riverItemCap).toBeLessThan(ZONE_ITEM_CAP);
    expect(TIER_BUDGETS.MEDIUM.riverItemCastShadow).toBe(false);
    expect(TIER_BUDGETS.LOW.riverItemCastShadow).toBe(false);
  });
  it("orders the thresholds", () => {
    expect(FALLBACK_FPS_THRESHOLD).toBeLessThan(STEP_DOWN_FPS_THRESHOLD.MEDIUM!);
    expect(STEP_DOWN_FPS_THRESHOLD.MEDIUM!).toBeLessThan(STEP_DOWN_FPS_THRESHOLD.HIGH!);
  });
  it("keeps the SSR default and positive technical numbers", () => {
    expect(DEFAULT_QUALITY_TIER).toBe("MEDIUM");
    expect(FPS_SAMPLE_WINDOW_MS).toBeGreaterThan(0);
    expect(TIER_SETTLE_MS).toBeGreaterThan(0);
    expect(FPS_STALL_GAP_MS).toBeGreaterThan(0);
  });
  it("antialias per tier (lead decision, MFW-27)", () => {
    expect(TIER_ANTIALIAS).toEqual({ HIGH: true, MEDIUM: true, LOW: false });
    expect(Object.isFrozen(TIER_ANTIALIAS)).toBe(true);
  });
  it("effect pool caps per tier (lead decision, MFW-28)", () => {
    expect(Object.isFrozen(EFFECT_POOL_CAPS)).toBe(true);
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      const caps = EFFECT_POOL_CAPS[tier];
      expect(Object.isFrozen(caps)).toBe(true);
      expect(Object.keys(caps).sort()).toEqual([...EFFECT_KINDS].sort());
      for (const kind of EFFECT_KINDS) expect(Number.isInteger(caps[kind]) && caps[kind] > 0).toBe(true);
    }
    for (const kind of EFFECT_KINDS) {
      expect(EFFECT_POOL_CAPS.HIGH[kind]).toBeGreaterThanOrEqual(EFFECT_POOL_CAPS.MEDIUM[kind]);
      expect(EFFECT_POOL_CAPS.MEDIUM[kind]).toBeGreaterThanOrEqual(EFFECT_POOL_CAPS.LOW[kind]);
    }
  });
});

describe("water effects and environment budgets (lead decision, MFW-49)", () => {
  const ORDER = ["HIGH", "MEDIUM", "LOW"] as const;
  it("LOW is the cheap water variant: no glints, no ripples", () => {
    expect(WATER_EFFECT_TIERS.LOW).toEqual({ glintCount: 0, krathongRipples: false });
    expect(WATER_EFFECT_TIERS.HIGH.krathongRipples).toBe(true);
    expect(WATER_EFFECT_TIERS.MEDIUM.krathongRipples).toBe(true);
  });
  it("counts and budgets never grow from HIGH to LOW", () => {
    for (let i = 1; i < ORDER.length; i++) {
      const [hi, lo] = [ORDER[i - 1], ORDER[i]];
      expect(WATER_EFFECT_TIERS[hi].glintCount).toBeGreaterThanOrEqual(WATER_EFFECT_TIERS[lo].glintCount);
      expect(ENVIRONMENT_RENDER_BUDGETS[hi].maxDrawCalls).toBeGreaterThanOrEqual(ENVIRONMENT_RENDER_BUDGETS[lo].maxDrawCalls);
      expect(ENVIRONMENT_RENDER_BUDGETS[hi].maxTriangles).toBeGreaterThanOrEqual(ENVIRONMENT_RENDER_BUDGETS[lo].maxTriangles);
    }
  });
  it("is frozen and positive", () => {
    for (const tier of ORDER) {
      expect(Object.isFrozen(WATER_EFFECT_TIERS[tier])).toBe(true);
      expect(Object.isFrozen(ENVIRONMENT_RENDER_BUDGETS[tier])).toBe(true);
      expect(Number.isInteger(WATER_EFFECT_TIERS[tier].glintCount)).toBe(true);
      expect(ENVIRONMENT_RENDER_BUDGETS[tier].maxDrawCalls).toBeGreaterThan(0);
      expect(ENVIRONMENT_RENDER_BUDGETS[tier].maxTriangles).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(WATER_EFFECT_TIERS)).toBe(true);
    expect(Object.isFrozen(ENVIRONMENT_RENDER_BUDGETS)).toBe(true);
    expect(KRATHONG_RIPPLE_MAX_TRIANGLES).toBeGreaterThan(0);
  });
});

describe("foliage per tier (lead decision, MFW-70)", () => {
  it("FOLIAGE_TIERS: HIGH and MEDIUM draw FULL and sway; LOW draws LIGHT and is static; frozen", () => {
    expect(FOLIAGE_TIERS.HIGH).toEqual({ variant: "FULL", sway: true });
    expect(FOLIAGE_TIERS.MEDIUM).toEqual({ variant: "FULL", sway: true });
    expect(FOLIAGE_TIERS.LOW).toEqual({ variant: "LIGHT", sway: false });
    expect(Object.isFrozen(FOLIAGE_TIERS)).toBe(true);
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) expect(Object.isFrozen(FOLIAGE_TIERS[tier])).toBe(true);
  });
});
