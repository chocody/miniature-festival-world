// @vitest-environment node
import { describe, expect, it } from "vitest";
import { wrap01 } from "./wrap01";

describe("wrap01", () => {
  it.each([
    [0, 0],
    [0.25, 0.25],
    [1, 0],
    [1.25, 0.25],
    [-0.25, 0.75],
    [-1, 0],
    [-1e-17, 0],
  ])("wrap01(%s) = %s", (input, expected) => {
    expect(wrap01(input)).toBe(expected);
  });

  it("normalizes -0 to 0", () => {
    expect(Object.is(wrap01(-0), 0)).toBe(true);
  });

  it("returns NaN for NaN and Infinity", () => {
    expect(wrap01(NaN)).toBeNaN();
    expect(wrap01(Infinity)).toBeNaN();
  });

  it("handles huge values", () => {
    expect(wrap01(252288.5)).toBeCloseTo(0.5, 9);
  });
});
