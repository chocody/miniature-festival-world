import { describe, expect, it } from "vitest";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import {
  DEFAULT_KRATHONG_APPEARANCE,
  KRATHONG_APPEARANCE_KEYS,
  parseKrathongAppearance,
  serializeKrathongAppearance,
} from "./krathongAppearance";
import type { KrathongAppearance } from "./types";

const valid = {
  base: "banana_trunk_01",
  lotusFold: "style_02",
  leafColor: LEAF_COLOR_PALETTE[0],
  flowers: ["marigold", "orchid"],
  candleColor: "#FFD166",
};
const withKey = (key: string, value: unknown) => ({ ...valid, [key]: value });
const reasonOf = (input: unknown) => {
  const result = parseKrathongAppearance(input);
  return result.ok ? null : result.reason;
};

describe("catalogue", () => {
  it("has the spec parts", () => {
    expect(KRATHONG_BASE_IDS).toEqual(["banana_trunk_01", "lotus_petal_01", "toy_bread_01"]);
    expect(FLOWER_KINDS).toEqual(["marigold", "orchid", "lotus"]);
    expect(LEAF_FOLD_STYLE_IDS.length).toBeGreaterThanOrEqual(2);
    expect(LEAF_COLOR_PALETTE.length).toBeGreaterThanOrEqual(2);
    expect(CANDLE_COLOR_PALETTE).toContain("#FFD166");
    for (const color of [...LEAF_COLOR_PALETTE, ...CANDLE_COLOR_PALETTE]) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("parseKrathongAppearance", () => {
  it("accepts the default as a fresh copy", () => {
    const result = parseKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appearance).toEqual(DEFAULT_KRATHONG_APPEARANCE);
    expect(result.appearance).not.toBe(DEFAULT_KRATHONG_APPEARANCE);
    expect(DEFAULT_KRATHONG_APPEARANCE.flowers).toHaveLength(RIM_SOCKET_COUNT);
    expect(Object.isFrozen(DEFAULT_KRATHONG_APPEARANCE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KRATHONG_APPEARANCE.flowers)).toBe(true);
  });

  it("accepts the spec section 5 example plus leafColor", () => {
    expect(parseKrathongAppearance(valid).ok).toBe(true);
  });

  it.each([
    ...KRATHONG_BASE_IDS.map((v) => ["base", v] as const),
    ...LEAF_FOLD_STYLE_IDS.map((v) => ["lotusFold", v] as const),
    ...LEAF_COLOR_PALETTE.map((v) => ["leafColor", v] as const),
    ...CANDLE_COLOR_PALETTE.map((v) => ["candleColor", v] as const),
    ...FLOWER_KINDS.map((v) => ["flowers", [v]] as const),
  ])("accepts %s = %j", (key, value) => {
    expect(parseKrathongAppearance(withKey(key, value)).ok).toBe(true);
  });

  it("uppercases colours", () => {
    const result = parseKrathongAppearance(withKey("candleColor", "#ffd166"));
    expect(result.ok && result.appearance.candleColor).toBe("#FFD166");
  });

  it("canonicalizes trailing nulls only", () => {
    const flowersOf = (flowers: unknown) => {
      const result = parseKrathongAppearance(withKey("flowers", flowers));
      return result.ok ? result.appearance.flowers : null;
    };
    expect(flowersOf(["marigold", null, null])).toEqual(["marigold"]);
    expect(flowersOf(["marigold", null, "orchid"])).toEqual(["marigold", null, "orchid"]);
    expect(flowersOf([])).toEqual([]);
    expect(flowersOf([null])).toEqual([]);
  });

  it.each([null, [], "x", 42, new Date(), Object.create({ base: "banana_trunk_01" })])(
    "rejects a non-plain object %#",
    (input) => {
      expect(reasonOf(input)).toBe("appearance must be a plain object");
    },
  );

  it("rejects unknown keys, including __proto__ and raw positions", () => {
    expect(reasonOf(JSON.parse(`{"__proto__":{},"base":"banana_trunk_01"}`))).toBe("unknown key: __proto__");
    expect(reasonOf({ ...valid, position: [0, 0, 0] })).toBe("unknown key: position");
    expect(reasonOf({ ...valid, x: 1 })).toBe("unknown key: x");
  });

  it.each(KRATHONG_APPEARANCE_KEYS)("rejects a missing %s", (key) => {
    const copy: Record<string, unknown> = { ...valid };
    delete copy[key];
    expect(reasonOf(copy)).toBe(`missing key: ${key}`);
  });

  it("rejects bad values with exact reasons", () => {
    expect(reasonOf(withKey("base", "banana_trunk_02"))).toBe("base is not a known krathong base");
    expect(reasonOf(withKey("lotusFold", "style_99"))).toBe("lotusFold is not a known fold style");
    for (const bad of ["#000000", "green", 123]) {
      expect(reasonOf(withKey("leafColor", bad))).toBe("leafColor is not in the leaf palette");
    }
    expect(reasonOf(withKey("candleColor", "#FFD16"))).toBe("candleColor is not in the candle palette");
    expect(reasonOf(withKey("flowers", "marigold"))).toBe("flowers must be an array");
    expect(reasonOf(withKey("flowers", Array<null>(RIM_SOCKET_COUNT + 1).fill(null)))).toBe(
      "flowers exceeds the rim socket count",
    );
    expect(reasonOf(withKey("flowers", ["rose"]))).toBe("flowers[0] is not a known flower");
    expect(reasonOf(withKey("flowers", ["marigold", 7]))).toBe("flowers[1] is not a known flower");
    expect(reasonOf(withKey("flowers", [, "marigold"]))).toBe("flowers[0] is not a known flower");
  });
});

describe("serializeKrathongAppearance", () => {
  const appearance: KrathongAppearance = {
    ...DEFAULT_KRATHONG_APPEARANCE,
    flowers: ["marigold", "orchid", null, "lotus"],
  };

  it("emits exactly the spec keys and round-trips through JSON", () => {
    const out = serializeKrathongAppearance(appearance);
    expect(Object.keys(out)).toEqual(["base", "lotusFold", "leafColor", "flowers", "candleColor"]);
    const parsed = parseKrathongAppearance(JSON.parse(JSON.stringify(out)));
    expect(parsed.ok && parsed.appearance).toEqual(out);
  });

  it("does not alias the input and holds no position keys", () => {
    const flowers: ("marigold" | null)[] = ["marigold"];
    const out = serializeKrathongAppearance({ ...appearance, flowers });
    flowers.push("marigold");
    expect(out.flowers).toEqual(["marigold"]);
    const json = JSON.stringify(out);
    for (const key of ["position", "rotation", "x", "y", "z"]) expect(json).not.toContain(`"${key}":`);
  });
});
