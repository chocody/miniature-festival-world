import { describe, expect, it } from "vitest";
import type { QualityTier } from "@/config/performance.config";
import { pickInitialTier } from "./initialTier";

const cases: [number | null, number | null, QualityTier][] = [
  [8, 8, "HIGH"],
  [8, 16, "HIGH"],
  [8, 6, "MEDIUM"],
  [4, 8, "MEDIUM"],
  [4, 5, "MEDIUM"],
  [3, 16, "LOW"],
  [8, 4, "LOW"],
  [2, 2, "LOW"],
  [null, null, "MEDIUM"],
  [null, 4, "LOW"],
  [null, 16, "MEDIUM"],
  [2, null, "LOW"],
  [8, null, "MEDIUM"],
];

describe("pickInitialTier", () => {
  it.each(cases)("memory %s, cores %s -> %s", (deviceMemoryGb, hardwareConcurrency, tier) => {
    expect(pickInitialTier({ webgl: true, deviceMemoryGb, hardwareConcurrency })).toBe(tier);
  });
  it("no WebGL -> FALLBACK_2D regardless of hints", () => {
    expect(pickInitialTier({ webgl: false, deviceMemoryGb: 8, hardwareConcurrency: 16 })).toBe(
      "FALLBACK_2D",
    );
  });
});
