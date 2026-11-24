import { describe, expect, it } from "vitest";
import { relativeLuminance } from "./relativeLuminance";

describe("relativeLuminance", () => {
  it("matches known colours", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 10);
    expect(relativeLuminance("#536e74")).toBeCloseTo(0.1425, 3);
  });
  it("rejects anything but #rrggbb", () => {
    for (const bad of ["#fff", "red", "#gggggg"]) expect(() => relativeLuminance(bad)).toThrow(RangeError);
  });
});
