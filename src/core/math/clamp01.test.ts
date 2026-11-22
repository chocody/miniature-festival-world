import { describe, expect, it } from "vitest";
import { clamp01 } from "./clamp01";

describe("clamp01", () => {
  it("passes through values inside [0, 1]", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(1)).toBe(1);
  });

  it("clamps out-of-range values", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(Infinity)).toBe(1);
    expect(clamp01(-Infinity)).toBe(0);
  });

  it("maps NaN to 0", () => {
    expect(clamp01(NaN)).toBe(0);
  });
});
