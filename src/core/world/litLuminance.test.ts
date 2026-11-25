import { describe, expect, it } from "vitest";
import { hexToLinearRgb, relativeLuminance } from "@/core/math/relativeLuminance";
import { estimateLitLuminance } from "./litLuminance";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const darkRig = (over: object = {}) => ({
  hemisphere: { skyColor: BLACK, groundColor: BLACK, intensity: 0 },
  ambient: { color: BLACK, intensity: 0 },
  key: { color: WHITE, intensity: 0, position: [0, 1, 0] as [number, number, number], shadow: { intensity: 0.5, radius: 2, bias: 0, normalBias: 0 } },
  ...over,
});

describe("estimateLitLuminance", () => {
  it("white albedo under a white key of intensity π along the normal → 1", () => {
    const rig = darkRig();
    rig.key = { ...rig.key, intensity: Math.PI, position: [0, 0, 5] };
    expect(estimateLitLuminance(WHITE, rig, [0, 0, 1])).toBeCloseTo(1, 9);
  });

  it("hemisphere: sky for an up normal, ground for a down normal", () => {
    const rig = darkRig({ hemisphere: { skyColor: WHITE, groundColor: BLACK, intensity: Math.PI } });
    expect(estimateLitLuminance(WHITE, rig, [0, 1, 0])).toBeCloseTo(1, 9);
    expect(estimateLitLuminance(WHITE, rig, [0, -1, 0])).toBeCloseTo(0, 9);
  });

  it("a key from behind adds nothing", () => {
    const rig = darkRig();
    rig.key = { ...rig.key, intensity: Math.PI, position: [0, 0, -5] };
    expect(estimateLitLuminance(WHITE, rig, [0, 0, 1])).toBe(0);
  });

  it("rejects a zero normal and a bad hex", () => {
    expect(() => estimateLitLuminance(WHITE, darkRig(), [0, 0, 0])).toThrow(RangeError);
    expect(() => estimateLitLuminance("#fff", darkRig(), [0, 1, 0])).toThrow(RangeError);
  });
});

describe("hexToLinearRgb", () => {
  it("white is [1, 1, 1] and relativeLuminance is unchanged", () => {
    expect(hexToLinearRgb("#FFFFFF")).toEqual([1, 1, 1]);
    expect(hexToLinearRgb("#000000")).toEqual([0, 0, 0]);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 10);
    expect(() => hexToLinearRgb("red")).toThrow(RangeError);
  });
});
