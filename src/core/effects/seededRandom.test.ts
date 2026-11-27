// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SKY_LAUNCH_SEED, SKY_LAUNCH_SPLIT } from "@/config/gimmicks.config";
import { createSeededRandom, pickSkyLaunch, resolveSkyLaunchSeed } from "./seededRandom";

const DRAWS = 10_000;

describe("createSeededRandom (MFW-75)", () => {
  it("SR1: the same seed gives the same sequence; seeds 1 and 2 differ", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(createSeededRandom(1)()).not.toBe(createSeededRandom(2)());
  });

  it("SR2: values lie in [0, 1) and average 0.5 ± 0.02", () => {
    const r = createSeededRandom(7);
    let sum = 0;
    for (let i = 0; i < DRAWS; i++) {
      const u = r();
      expect(u >= 0 && u < 1).toBe(true);
      sum += u;
    }
    expect(Math.abs(sum / DRAWS - 0.5)).toBeLessThan(0.02);
  });

  it("SR3: a non-safe-integer seed throws a RangeError", () => {
    expect(() => createSeededRandom(1.5)).toThrow(RangeError);
    expect(() => createSeededRandom(Number.NaN)).toThrow(RangeError);
  });
});

describe("pickSkyLaunch (MFW-75)", () => {
  it("SR4: u below the share is a firework, else a sky lantern", () => {
    expect(pickSkyLaunch(0.49, 0.5)).toBe("firework");
    expect(pickSkyLaunch(0.5, 0.5)).toBe("skyLantern");
    expect(pickSkyLaunch(Number.NaN, 0.5)).toBe("skyLantern");
    expect(pickSkyLaunch(0.99, 1)).toBe("firework");
    expect(pickSkyLaunch(0, 0)).toBe("skyLantern");
  });

  it("SR5: the seeded picks follow SKY_LAUNCH_SPLIT within ± 0.02", () => {
    const r = createSeededRandom(SKY_LAUNCH_SEED);
    let fireworks = 0;
    for (let i = 0; i < DRAWS; i++) if (pickSkyLaunch(r(), SKY_LAUNCH_SPLIT.fireworkShare) === "firework") fireworks++;
    expect(Math.abs(fireworks / DRAWS - SKY_LAUNCH_SPLIT.fireworkShare)).toBeLessThan(0.02);
  });
});

describe("resolveSkyLaunchSeed (MFW-75, caller override of D3)", () => {
  it("SR6: a positive safe-integer override wins and the entropy source is not read", () => {
    let reads = 0;
    const entropy = () => (reads++, 0.25);
    expect(resolveSkyLaunchSeed(SKY_LAUNCH_SEED, entropy)).toBe(SKY_LAUNCH_SEED);
    expect(reads).toBe(0);
  });

  it("SR7: no or a bad override → a seed from the entropy source (unsigned 32-bit), usable by createSeededRandom", () => {
    for (const bad of [undefined, null, 0, -3, 1.5, Number.NaN, "8"]) {
      expect(resolveSkyLaunchSeed(bad, () => 0.25), String(bad)).toBe(2 ** 30);
    }
    const seeds = [0, 0.5, 0.999_999].map((u) => resolveSkyLaunchSeed(undefined, () => u));
    expect(seeds[0]).toBe(0);
    expect(new Set(seeds).size).toBe(3);
    for (const s of seeds) {
      expect(Number.isSafeInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
      expect(() => createSeededRandom(s)).not.toThrow();
    }
    for (const bad of [Number.NaN, -0.1, 1, Infinity]) expect(resolveSkyLaunchSeed(undefined, () => bad)).toBe(0);
  });
});
