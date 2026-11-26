// @vitest-environment node
import { describe, expect, it } from "vitest";
import { relativeLuminance } from "@/core/math/relativeLuminance";
import {
  FLAME_FLICKER,
  FLAME_FLICKER_MAX_EMISSIVE_SWING,
  FLAME_FLICKER_MAX_HZ,
  FLAME_FLICKER_REDRAW_INTERVAL_MS,
  KRATHONG_BASE_MODELS,
  KRATHONG_CANDLE_MODEL,
  KRATHONG_FLAME_MODEL,
  KRATHONG_FLOWER_CENTRE_MIN_CONTRAST,
  KRATHONG_FLOWER_CENTRE_MODEL,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_COUNT,
  KRATHONG_LEAF_MODELS,
  KRATHONG_LEAF_VARIATION,
  KRATHONG_LODS,
  KRATHONG_MAX_TRIANGLES_BY_LOD,
  KRATHONG_RIVER_LOD_BY_TIER,
} from "./krathongModel.config";
import { LOOK_PALETTE } from "./look.config";

function expectDeepFrozen(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value), path).toBe(true);
  for (const [k, v] of Object.entries(value)) expectDeepFrozen(v, `${path}.${k}`);
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("krathong model v2 config (MFW-48)", () => {
  it("every spec object is deeply frozen; one leaf variation per leaf", () => {
    const specs = {
      KRATHONG_BASE_MODELS,
      KRATHONG_LEAF_MODELS,
      KRATHONG_FLOWER_MODELS,
      KRATHONG_FLOWER_CENTRE_MODEL,
      KRATHONG_CANDLE_MODEL,
      KRATHONG_FLAME_MODEL,
      KRATHONG_INCENSE_MODEL,
      KRATHONG_LEAF_VARIATION,
      FLAME_FLICKER,
      FLAME_FLICKER_REDRAW_INTERVAL_MS,
      KRATHONG_RIVER_LOD_BY_TIER,
      KRATHONG_MAX_TRIANGLES_BY_LOD,
    };
    for (const [name, spec] of Object.entries(specs)) expectDeepFrozen(spec, name);
    expect(KRATHONG_LEAF_VARIATION).toHaveLength(KRATHONG_LEAF_COUNT);
  });

  it("all part scales are ONE except toy_bread_01, which keeps its v1 squash", () => {
    const parts = [
      ...Object.entries(KRATHONG_BASE_MODELS),
      ...Object.entries(KRATHONG_LEAF_MODELS),
      ...Object.entries(KRATHONG_FLOWER_MODELS),
      ["candle", KRATHONG_CANDLE_MODEL],
      ["flame", KRATHONG_FLAME_MODEL],
      ["incense", KRATHONG_INCENSE_MODEL],
    ] as const;
    for (const [id, spec] of parts) {
      expect(spec.scale, id).toEqual(id === "toy_bread_01" ? [1, 0.32, 1] : [1, 1, 1]);
    }
  });

  it("flicker stays within WCAG 2.3.1 (≤ 3 Hz, swing < 10 %)", () => {
    let weights = 0;
    for (const c of FLAME_FLICKER.components) {
      expect(c.hz).toBeGreaterThan(0);
      expect(c.hz).toBeLessThanOrEqual(FLAME_FLICKER_MAX_HZ);
      weights += c.weight;
    }
    expect(Math.abs(weights - 1)).toBeLessThan(1e-9);
    expect(2 * FLAME_FLICKER.emissiveAmplitude).toBeLessThan(FLAME_FLICKER_MAX_EMISSIVE_SWING);
  });

  it("flower centres contrast with every petal colour", () => {
    for (const [kind, flower] of Object.entries(KRATHONG_FLOWER_MODELS)) {
      expect(contrast(KRATHONG_FLOWER_CENTRE_MODEL.color, flower.color), kind).toBeGreaterThanOrEqual(
        KRATHONG_FLOWER_CENTRE_MIN_CONTRAST,
      );
    }
  });

  it("uses the look palette for the v2 colours", () => {
    expect(KRATHONG_BASE_MODELS.banana_trunk_01.color).toBe(LOOK_PALETTE.leafLight);
    expect(KRATHONG_FLOWER_CENTRE_MODEL.color).toBe(LOOK_PALETTE.flowerYellow);
    expect(KRATHONG_FLAME_MODEL.color).toBe(LOOK_PALETTE.flameCore);
    expect(KRATHONG_INCENSE_MODEL.color).toBe(LOOK_PALETTE.doorWood);
  });

  it("redraw intervals are positive integers, HIGH ≤ MEDIUM ≤ LOW", () => {
    const { HIGH, MEDIUM, LOW } = FLAME_FLICKER_REDRAW_INTERVAL_MS;
    for (const v of [HIGH, MEDIUM, LOW]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(HIGH).toBeLessThanOrEqual(MEDIUM);
    expect(MEDIUM).toBeLessThanOrEqual(LOW);
  });

  it("LOD map covers every 3D tier with a known LOD (MFW-69)", () => {
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) expect(KRATHONG_LODS, tier).toContain(KRATHONG_RIVER_LOD_BY_TIER[tier]);
    expect(Object.keys(KRATHONG_RIVER_LOD_BY_TIER).sort()).toEqual(["HIGH", "LOW", "MEDIUM"]);
    // A lower tier never draws more detail than a higher one.
    const rank = (t: keyof typeof KRATHONG_RIVER_LOD_BY_TIER) => KRATHONG_LODS.indexOf(KRATHONG_RIVER_LOD_BY_TIER[t]);
    expect(rank("HIGH")).toBeLessThanOrEqual(rank("MEDIUM"));
    expect(rank("MEDIUM")).toBeLessThanOrEqual(rank("LOW"));
    expect(KRATHONG_RIVER_LOD_BY_TIER.MEDIUM).toBe("medium");
    expect(KRATHONG_RIVER_LOD_BY_TIER.LOW).toBe("low");
  });
});
