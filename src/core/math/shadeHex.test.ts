import { describe, expect, it } from "vitest";
import { shadeHex } from "./shadeHex";

describe("shadeHex", () => {
  it.each([
    ["#FFFFFF", 0.5, "#808080"],
    ["#5e8c3a", 1, "#5e8c3a"],
    ["#102030", 2, "#204060"],
    ["#F0F0F0", 2, "#ffffff"],
    ["#abc", 0.5, "#abc"],
    ["#123456", NaN, "#123456"],
  ])("shadeHex(%s, %s) = %s", (hex, factor, expected) => {
    expect(shadeHex(hex, factor)).toBe(expected);
  });
});
