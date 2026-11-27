import { describe, expect, it } from "vitest";
import { STAR_DEFAULT_DESIGN, STAR_DESIGN_IDS } from "@/config/starDesigns.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "./krathongAppearance";
import { DEFAULT_ORNAMENT_APPEARANCE } from "./ornamentAppearance";
import { DEFAULT_STAR_APPEARANCE, STAR_APPEARANCE_KEYS, parseStarAppearance } from "./starAppearance";

class Local {
  design = "star_classic_01";
}
const NOT_OBJECTS: unknown[] = [null, undefined, "star_classic_01", 42, true, [], ["star_classic_01"], new Map(), new Date(), new Local()];
const BAD_DESIGNS: unknown[] = ["STAR_CLASSIC_01", " star_classic_01", "star_classic_02", "star_01", "ball_01", "lotus_bud_01", "", null, undefined, 1, ["star_classic_01"], { id: "star_classic_01" }];

describe("parseStarAppearance", () => {
  it("SA1 accepts every catalogue id as a fresh {design} object", () => {
    for (const id of STAR_DESIGN_IDS) {
      const input = { design: id };
      const r = parseStarAppearance(input);
      expect(r).toEqual({ ok: true, appearance: { design: id } });
      if (r.ok) {
        expect(r.appearance).not.toBe(input);
        expect(Object.keys(r.appearance)).toEqual(["design"]);
      }
    }
  });
  it("SA2 default is frozen and parses to a copy", () => {
    expect(DEFAULT_STAR_APPEARANCE).toEqual({ design: STAR_DEFAULT_DESIGN });
    expect(Object.isFrozen(DEFAULT_STAR_APPEARANCE)).toBe(true);
    const r = parseStarAppearance(DEFAULT_STAR_APPEARANCE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appearance).toEqual(DEFAULT_STAR_APPEARANCE);
      expect(r.appearance).not.toBe(DEFAULT_STAR_APPEARANCE);
    }
    expect(STAR_APPEARANCE_KEYS).toEqual(["design"]);
  });
  it("SA3 accepts a null-prototype object", () => {
    expect(parseStarAppearance(Object.assign(Object.create(null), { design: "star_comet_01" }))).toEqual({
      ok: true,
      appearance: { design: "star_comet_01" },
    });
  });
  it("SA4 rejects non-plain objects", () => {
    for (const input of NOT_OBJECTS) {
      expect(parseStarAppearance(input)).toEqual({ ok: false, reason: "appearance must be a plain object" });
    }
  });
  it("SA5 enforces the exact key set", () => {
    expect(parseStarAppearance({})).toEqual({ ok: false, reason: "missing key: design" });
    expect(parseStarAppearance({ design: "star_classic_01", color: "#FFD700" })).toEqual({ ok: false, reason: "unknown key: color" });
    expect(parseStarAppearance(JSON.parse('{"design":"star_classic_01","__proto__":{"polluted":true}}'))).toEqual({
      ok: false,
      reason: "unknown key: __proto__",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseStarAppearance(DEFAULT_KRATHONG_APPEARANCE)).toEqual({ ok: false, reason: "unknown key: base" });
    expect(parseStarAppearance(DEFAULT_ORNAMENT_APPEARANCE)).toEqual({ ok: false, reason: "design is not a known star design" });
  });
  it("SA6 rejects unknown designs and never throws", () => {
    for (const design of BAD_DESIGNS) {
      expect(parseStarAppearance({ design })).toEqual({ ok: false, reason: "design is not a known star design" });
    }
    for (const input of [...NOT_OBJECTS, ...BAD_DESIGNS.map((design) => ({ design })), Symbol("x"), () => {}]) {
      expect(() => parseStarAppearance(input)).not.toThrow();
    }
  });
});
