// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TIER_BUDGETS, TIER_MAX_RENDER_PIXELS } from "@/config/performance.config";
import { getCanvasDprRange } from "./renderPixelRatio";

describe("getCanvasDprRange (MFW-54)", () => {
  it("HIGH and MEDIUM keep their pixelRatioCap on phones", () => {
    for (const tier of ["HIGH", "MEDIUM"] as const) {
      for (const area of [360 * 640, 390 * 844]) {
        expect(getCanvasDprRange(tier, area)).toEqual([1, TIER_BUDGETS[tier].pixelRatioCap]);
      }
    }
  });

  it("a large HIGH / MEDIUM screen renders within the tier pixel budget", () => {
    for (const tier of ["HIGH", "MEDIUM"] as const) {
      const max = TIER_MAX_RENDER_PIXELS[tier]!;
      for (const area of [1440 * 900, 2560 * 1440, 3840 * 2160]) {
        const [lo, hi] = getCanvasDprRange(tier, area);
        expect(hi).toBeLessThan(TIER_BUDGETS[tier].pixelRatioCap);
        expect(area * hi * hi).toBeCloseTo(max, 3);
        expect(lo).toBe(Math.min(1, hi));
      }
    }
    // 1440×900 HIGH: ≈ 1.39, not the retina cap 2
    expect(getCanvasDprRange("HIGH", 1440 * 900)[1]).toBeCloseTo(Math.sqrt(2_500_000 / (1440 * 900)), 9);
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
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      for (const area of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(getCanvasDprRange(tier, area)).toEqual([1, TIER_BUDGETS[tier].pixelRatioCap]);
      }
    }
  });
});
