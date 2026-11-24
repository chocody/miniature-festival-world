import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUALITY_TIER,
  FALLBACK_FPS_THRESHOLD,
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
});
