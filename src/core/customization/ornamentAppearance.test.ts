import { describe, expect, it } from "vitest";
import { ORNAMENT_DEFAULT_DESIGN, ORNAMENT_DESIGN_IDS } from "@/config/ornamentDesigns.config";
import { DEFAULT_KRATHONG_APPEARANCE } from "./krathongAppearance";
import {
  DEFAULT_ORNAMENT_APPEARANCE,
  ORNAMENT_APPEARANCE_KEYS,
  parseOrnamentAppearance,
} from "./ornamentAppearance";

class Local {
  design = "ball_01";
}
const NOT_OBJECTS: unknown[] = [null, undefined, "ball_01", 42, true, [], ["ball_01"], new Map(), new Date(), new Local()];
const BAD_DESIGNS: unknown[] = ["BALL_01", " ball_01", "ball_02", "lotus_bud_01", "", null, undefined, 1, ["ball_01"], { id: "ball_01" }];

describe("parseOrnamentAppearance", () => {
  it("OA1 accepts every catalogue id as a fresh {design} object", () => {
    for (const id of ORNAMENT_DESIGN_IDS) {
      const input = { design: id };
      const r = parseOrnamentAppearance(input);
      expect(r).toEqual({ ok: true, appearance: { design: id } });
      if (r.ok) {
        expect(r.appearance).not.toBe(input);
        expect(Object.keys(r.appearance)).toEqual(["design"]);
      }
    }
  });
  it("OA2 default is frozen and parses to a copy", () => {
    expect(DEFAULT_ORNAMENT_APPEARANCE).toEqual({ design: ORNAMENT_DEFAULT_DESIGN });
    expect(Object.isFrozen(DEFAULT_ORNAMENT_APPEARANCE)).toBe(true);
    const r = parseOrnamentAppearance(DEFAULT_ORNAMENT_APPEARANCE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appearance).toEqual(DEFAULT_ORNAMENT_APPEARANCE);
      expect(r.appearance).not.toBe(DEFAULT_ORNAMENT_APPEARANCE);
    }
    expect(ORNAMENT_APPEARANCE_KEYS).toEqual(["design"]);
  });
  it("accepts gift_01 and rejects snowman_01", () => {
    expect(parseOrnamentAppearance({ design: "gift_01" })).toEqual({ ok: true, appearance: { design: "gift_01" } });
    expect(parseOrnamentAppearance({ design: "snowman_01" })).toEqual({
      ok: false,
      reason: "design is not a known ornament design",
    });
  });
  it("OA3 accepts a null-prototype object", () => {
    expect(parseOrnamentAppearance(Object.assign(Object.create(null), { design: "star_01" }))).toEqual({
      ok: true,
      appearance: { design: "star_01" },
    });
  });
  it("OA4 rejects non-plain objects", () => {
    for (const input of NOT_OBJECTS) {
      expect(parseOrnamentAppearance(input)).toEqual({ ok: false, reason: "appearance must be a plain object" });
    }
  });
  it("OA5 enforces the exact key set", () => {
    expect(parseOrnamentAppearance({})).toEqual({ ok: false, reason: "missing key: design" });
    expect(parseOrnamentAppearance({ design: "ball_01", color: "#FFFFFF" })).toEqual({ ok: false, reason: "unknown key: color" });
    expect(parseOrnamentAppearance({ design: "ball_01", base: "banana_trunk_01" })).toEqual({ ok: false, reason: "unknown key: base" });
    expect(parseOrnamentAppearance(JSON.parse('{"design":"ball_01","__proto__":{"polluted":true}}'))).toEqual({
      ok: false,
      reason: "unknown key: __proto__",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseOrnamentAppearance(DEFAULT_KRATHONG_APPEARANCE)).toEqual({ ok: false, reason: "unknown key: base" });
  });
  it("OA6 rejects unknown designs and never throws", () => {
    for (const design of BAD_DESIGNS) {
      expect(parseOrnamentAppearance({ design })).toEqual({ ok: false, reason: "design is not a known ornament design" });
    }
    for (const input of [...NOT_OBJECTS, ...BAD_DESIGNS.map((design) => ({ design })), Symbol("x"), () => {}]) {
      expect(() => parseOrnamentAppearance(input)).not.toThrow();
    }
  });
});
