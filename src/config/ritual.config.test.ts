// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LATERAL_OFFSET_RANGE } from "@/core/coordinates";
import { RITUAL_ERROR_KINDS } from "@/core/ritual";
import {
  RELEASE_BUMP,
  RELEASE_CANDLE,
  RELEASE_LOWER_SPRING,
  RELEASE_SETTLE_SPRING,
  RITUAL_COPY,
  SPLINE_LATERAL_OFFSET_LIMIT,
} from "./ritual.config";

describe("ritual config", () => {
  it("the three-free lateral limit matches the coordinate range", () => {
    expect(SPLINE_LATERAL_OFFSET_LIMIT).toBe(LATERAL_OFFSET_RANGE[1]);
  });

  it.each([
    ["lower", RELEASE_LOWER_SPRING],
    ["settle", RELEASE_SETTLE_SPRING],
    ["bump", RELEASE_BUMP.spring],
    ["candle", RELEASE_CANDLE.spring],
  ])("%s spring is finite and positive", (_name, spring) => {
    for (const v of [spring.mass, spring.tension, spring.friction]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("brightens the candle and hops up", () => {
    expect(RELEASE_CANDLE.brightenFactor).toBeGreaterThan(1);
    expect(RELEASE_BUMP.hopHeight).toBeGreaterThan(0);
  });

  it("has Thai copy for every error kind", () => {
    for (const kind of RITUAL_ERROR_KINDS) expect(RITUAL_COPY.errors[kind].length).toBeGreaterThan(0);
    expect(RITUAL_COPY.releaseButton).toBe("ปล่อยกระทง");
  });
});
