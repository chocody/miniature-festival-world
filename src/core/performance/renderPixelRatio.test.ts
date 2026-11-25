// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TIER_BUDGETS, TIER_MAX_RENDER_PIXELS } from "@/config/performance.config";
import { getCanvasDprRange } from "./renderPixelRatio";

describe("getCanvasDprRange (MFW-54)", () => {
  it("uncapped tiers keep [1, pixelRatioCap] at any screen size", () => {
    for (const tier of ["HIGH", "MEDIUM"] as const) {
      expect(TIER_MAX_RENDER_PIXELS[tier]).toBeNull();
      for (const area of [360 * 640, 1440 * 900, 3840 * 2160]) {
        expect(getCanvasDprRange(tier, area)).toEqual([1, TIER_BUDGETS[tier].pixelRatioCap]);
      }
    }
  });

  it("LOW keeps ratio 1 on a phone and renders a big screen at the pixel budget", () => {
    const max = TIER_MAX_RENDER_PIXELS.LOW!;
    expect(getCanvasDprRange("LOW", 360 * 640)).toEqual([1, TIER_BUDGETS.LOW.pixelRatioCap]);
    expect(getCanvasDprRange("LOW", 390 * 844)).toEqual([1, TIER_BUDGETS.LOW.pixelRatioCap]);
    for (const area of [1280 * 720, 1440 * 900, 2560 * 1440]) {
      const [lo, hi] = getCanvasDprRange("LOW", area);
      expect(lo).toBe(hi);
      expect(hi).toBeLessThan(1);
      expect(area * hi * hi).toBeCloseTo(max, 6);
    }
  });

  it("never exceeds the tier pixelRatioCap", () => {
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      for (const area of [1, 100, 360 * 640]) expect(getCanvasDprRange(tier, area)[1]).toBeLessThanOrEqual(TIER_BUDGETS[tier].pixelRatioCap);
    }
  });

  it("an unknown screen size keeps the tier range", () => {
    for (const area of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getCanvasDprRange("LOW", area)).toEqual([1, TIER_BUDGETS.LOW.pixelRatioCap]);
    }
  });
});
