import { describe, expect, it } from "vitest";
import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { defaultEventAppearance, isKrathongAppearance, parseEventAppearance } from "./appearanceRegistry";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";
import { DEFAULT_ORNAMENT_APPEARANCE, parseOrnamentAppearance } from "./ornamentAppearance";
import { DEFAULT_STAR_APPEARANCE, parseStarAppearance } from "./starAppearance";

describe("parseEventAppearance", () => {
  it("parses Loy Krathong appearances", () => {
    expect(parseEventAppearance("loy_krathong", DEFAULT_KRATHONG_APPEARANCE).ok).toBe(true);
    expect(parseEventAppearance("loy_krathong", { base: "x" })).toEqual(parseKrathongAppearance({ base: "x" }));
    expect(parseEventAppearance("loy_krathong", { base: "x" }).ok).toBe(false);
  });
  it("AR1 parses christmas ornament appearances", () => {
    expect(parseEventAppearance("christmas", { design: "bow_01" })).toEqual({ ok: true, appearance: { design: "bow_01" } });
    expect(parseEventAppearance("christmas", { design: "bow_01" })).toEqual(parseOrnamentAppearance({ design: "bow_01" }));
  });
  it("AR2 rejects the other event's appearance", () => {
    expect(parseEventAppearance("christmas", DEFAULT_KRATHONG_APPEARANCE)).toEqual({ ok: false, reason: "unknown key: base" });
    expect(parseEventAppearance("christmas", { design: "lotus_bud_01" })).toEqual({
      ok: false,
      reason: "design is not a known ornament design",
    });
    expect(parseEventAppearance("loy_krathong", DEFAULT_ORNAMENT_APPEARANCE)).toEqual({ ok: false, reason: "missing key: base" });
    expect(parseEventAppearance("loy_krathong", { ...DEFAULT_KRATHONG_APPEARANCE, design: "ball_01" })).toEqual({
      ok: false,
      reason: "design is not a known krathong design",
    });
  });
  it("AR3 rejects stub events", () => {
    expect(parseEventAppearance("chinese_new_year", {})).toEqual({
      ok: false,
      reason: "no appearance schema for event: chinese_new_year",
    });
  });
  it("AR6 parses new_year stars and rejects them elsewhere", () => {
    expect(parseEventAppearance("new_year", { design: "star_sparkle_01" })).toEqual({ ok: true, appearance: { design: "star_sparkle_01" } });
    expect(parseEventAppearance("new_year", { design: "star_sparkle_01" })).toEqual(parseStarAppearance({ design: "star_sparkle_01" }));
    expect(parseEventAppearance("new_year", DEFAULT_KRATHONG_APPEARANCE)).toEqual({ ok: false, reason: "unknown key: base" });
    for (const input of [DEFAULT_ORNAMENT_APPEARANCE, { design: "star_01" }]) {
      expect(parseEventAppearance("new_year", input)).toEqual({ ok: false, reason: "design is not a known star design" });
    }
    expect(parseEventAppearance("christmas", DEFAULT_STAR_APPEARANCE)).toEqual({ ok: false, reason: "design is not a known ornament design" });
    expect(parseEventAppearance("loy_krathong", DEFAULT_STAR_APPEARANCE)).toEqual({ ok: false, reason: "missing key: base" });
    expect(parseEventAppearance("loy_krathong", { ...DEFAULT_KRATHONG_APPEARANCE, design: "star_classic_01" })).toEqual({
      ok: false,
      reason: "design is not a known krathong design",
    });
    for (const id of FESTIVAL_EVENT_IDS) {
      if (id !== "new_year") expect(parseEventAppearance(id, DEFAULT_STAR_APPEARANCE).ok).toBe(false);
    }
  });
  it("never throws", () => {
    for (const input of [undefined, null, () => {}, Symbol("x")]) {
      expect(() => parseEventAppearance("loy_krathong", input)).not.toThrow();
      expect(() => parseEventAppearance("christmas", input)).not.toThrow();
      expect(() => parseEventAppearance("new_year", input)).not.toThrow();
    }
  });
});

describe("defaultEventAppearance / isKrathongAppearance", () => {
  it("AR4 returns the frozen constants, null elsewhere", () => {
    expect(defaultEventAppearance("loy_krathong")).toBe(DEFAULT_KRATHONG_APPEARANCE);
    expect(defaultEventAppearance("christmas")).toBe(DEFAULT_ORNAMENT_APPEARANCE);
    expect(defaultEventAppearance("new_year")).toBe(DEFAULT_STAR_APPEARANCE);
    for (const id of FESTIVAL_EVENT_IDS) {
      if (id !== "loy_krathong" && id !== "christmas" && id !== "new_year") expect(defaultEventAppearance(id)).toBeNull();
    }
  });
  it("AR5 narrows by the own base key", () => {
    expect(isKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)).toBe(true);
    expect(isKrathongAppearance(DEFAULT_ORNAMENT_APPEARANCE)).toBe(false);
    expect(isKrathongAppearance(DEFAULT_STAR_APPEARANCE)).toBe(false);
  });
});
