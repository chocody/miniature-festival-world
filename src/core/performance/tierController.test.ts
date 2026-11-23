import { describe, expect, it } from "vitest";
import type { QualityTier } from "@/config/performance.config";
import { createTierController, type TierController } from "./tierController";

function feed(ctrl: TierController, fps: number, fromK: number, count: number) {
  const out = [];
  for (let k = fromK; k < fromK + count; k++) {
    out.push(ctrl.onSample({ fps, startMs: k * 1000, endMs: (k + 1) * 1000 }));
  }
  return out;
}
const decisions = (r: ReturnType<typeof feed>) => r.filter((d) => d !== null);

describe("tierController", () => {
  it("no decision for healthy HIGH", () => {
    expect(decisions(feed(createTierController("HIGH"), 50, 0, 20))).toEqual([]);
  });
  it("HIGH steps down to MEDIUM after 5 s below 45", () => {
    const r = feed(createTierController("HIGH"), 40, 0, 5);
    expect(r.slice(0, 4).every((d) => d === null)).toBe(true);
    expect(r[4]).toEqual({
      from: "HIGH",
      to: "MEDIUM",
      reason: "FPS_BELOW_STEP_DOWN_THRESHOLD",
      atMs: 5000,
    });
  });
  it("a recovered window resets the streak", () => {
    const c = createTierController("HIGH");
    const r = [...feed(c, 40, 0, 4), ...feed(c, 46, 4, 1), ...feed(c, 40, 5, 4)];
    expect(decisions(r)).toEqual([]);
  });
  it("exactly the threshold is not below it", () => {
    expect(decisions(feed(createTierController("HIGH"), 45, 0, 20))).toEqual([]);
    expect(decisions(feed(createTierController("LOW"), 20, 0, 20))).toEqual([]);
  });
  it("settles after a change, then MEDIUM steps to LOW", () => {
    const c = createTierController("HIGH");
    expect(feed(c, 40, 0, 5)[4]?.to).toBe("MEDIUM");
    // windows starting at 5000 and 6000 are ignored (settle)
    expect(decisions(feed(c, 25, 5, 2))).toEqual([]);
    const r = feed(c, 25, 7, 5);
    expect(r.slice(0, 4).every((d) => d === null)).toBe(true);
    expect(r[4]).toMatchObject({ from: "MEDIUM", to: "LOW", atMs: 12_000 });
    expect(c.tier).toBe("LOW");
  });
  it("LOW at 25 does nothing; LOW at 15 falls back after 5 s", () => {
    const c = createTierController("LOW");
    expect(decisions(feed(c, 25, 0, 60))).toEqual([]);
    const r = feed(c, 15, 60, 5);
    expect(r[4]).toMatchObject({
      from: "LOW",
      to: "FALLBACK_2D",
      reason: "FPS_BELOW_FALLBACK_THRESHOLD",
    });
  });
  it("fallback takes precedence over step-down on HIGH", () => {
    const r = feed(createTierController("HIGH"), 10, 0, 5);
    expect(r[4]).toMatchObject({ from: "HIGH", to: "FALLBACK_2D" });
  });
  it("FALLBACK_2D is sticky", () => {
    const c = createTierController("LOW");
    feed(c, 10, 0, 5);
    expect(c.tier).toBe("FALLBACK_2D");
    expect(decisions(feed(c, 60, 10, 20))).toEqual([]);
    expect(c.tier).toBe("FALLBACK_2D");
  });
  it("never steps up", () => {
    const low = createTierController("LOW");
    expect(decisions(feed(low, 60, 0, 30))).toEqual([]);
    expect(low.tier).toBe("LOW");
    const med = createTierController("MEDIUM");
    expect(decisions(feed(med, 60, 0, 30))).toEqual([]);
    expect(med.tier).toBe("MEDIUM");
  });
  it("reset() clears a streak but keeps the tier", () => {
    const c = createTierController("HIGH");
    feed(c, 40, 0, 3);
    c.reset();
    expect(decisions(feed(c, 40, 3, 2))).toEqual([]);
    expect(c.tier).toBe("HIGH");
  });
  it("starting in FALLBACK_2D never decides", () => {
    const c = createTierController("FALLBACK_2D" as QualityTier);
    expect(decisions(feed(c, 1, 0, 20))).toEqual([]);
  });
  it("ignores NaN samples", () => {
    const c = createTierController("HIGH");
    expect(c.onSample({ fps: NaN, startMs: 0, endMs: 1000 })).toBeNull();
  });
});
