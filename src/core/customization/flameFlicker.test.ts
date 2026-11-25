// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAME_FLICKER, FLAME_FLICKER_MAX_EMISSIVE_SWING, FLAME_FLICKER_MAX_HZ } from "@/config/krathongModel.config";
import { createFlameFlickerFrame, STATIC_FLAME_FLICKER, writeFlameFlickerAt } from "./flameFlicker";

const STATIC = { heightScale: 1, widthScale: 1, emissiveScale: 1 };

describe("flame flicker (MFW-48)", () => {
  it("is static under reduced motion", () => {
    for (const t of [0, 1234, 1e9]) expect(writeFlameFlickerAt(t, true, createFlameFlickerFrame())).toEqual(STATIC);
    expect(STATIC_FLAME_FLICKER).toEqual(STATIC);
    expect(Object.isFrozen(STATIC_FLAME_FLICKER)).toBe(true);
  });

  it("is static for a non-finite time", () => {
    for (const t of [NaN, Infinity, -Infinity]) expect(writeFlameFlickerAt(t, false, createFlameFlickerFrame())).toEqual(STATIC);
  });

  it("follows the two-sine formula", () => {
    const f = writeFlameFlickerAt(0, false, createFlameFlickerFrame());
    const s = 0.4 * Math.sin(1.7);
    expect(f.heightScale).toBeCloseTo(1 + 0.08 * s, 9);
    expect(f.widthScale).toBeCloseTo(1 - 0.04 * s, 9);
    expect(f.emissiveScale).toBeCloseTo(1 + 0.04 * s, 9);
  });

  it("writes into and returns the same object", () => {
    const out = createFlameFlickerFrame();
    expect(writeFlameFlickerAt(500, false, out)).toBe(out);
  });

  it("is gentle: |s| ≤ 1, ≤ 3 maxima per second, emissive swing < 10 % (WCAG 2.3.1)", () => {
    const out = createFlameFlickerFrame();
    const heights: number[] = [];
    let minE = Infinity;
    let maxE = -Infinity;
    for (let t = 0; t <= 20_000; t += 1) {
      writeFlameFlickerAt(t, false, out);
      heights.push(out.heightScale);
      const s = (out.heightScale - 1) / FLAME_FLICKER.heightAmplitude;
      expect(Math.abs(s)).toBeLessThanOrEqual(1 + 1e-9);
      minE = Math.min(minE, out.emissiveScale);
      maxE = Math.max(maxE, out.emissiveScale);
    }
    const maxima: number[] = [];
    for (let i = 1; i < heights.length - 1; i++) {
      if (heights[i] > heights[i - 1] && heights[i] >= heights[i + 1]) maxima.push(i);
    }
    expect(maxima.length).toBeGreaterThan(0);
    for (let start = 0; start + 1000 <= heights.length; start += 50) {
      const inWindow = maxima.filter((m) => m >= start && m < start + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(FLAME_FLICKER_MAX_HZ);
    }
    expect(maxE - minE).toBeLessThan(FLAME_FLICKER_MAX_EMISSIVE_SWING);
  });
});
