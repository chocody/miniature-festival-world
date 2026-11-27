import { describe, expect, it } from "vitest";
import { FESTIVAL_EVENT_IDS } from "@/config/events/types";
import { defaultEventAppearance, isKrathongAppearance, parseEventAppearance } from "./appearanceRegistry";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";
import { DEFAULT_ORNAMENT_APPEARANCE, parseOrnamentAppearance } from "./ornamentAppearance";

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
    expect(parseEventAppearance("new_year", {})).toEqual({
      ok: false,
      reason: "no appearance schema for event: new_year",
    });
  });
  it("never throws", () => {
    for (const input of [undefined, null, () => {}, Symbol("x")]) {
      expect(() => parseEventAppearance("loy_krathong", input)).not.toThrow();
      expect(() => parseEventAppearance("christmas", input)).not.toThrow();
    }
  });
});

describe("defaultEventAppearance / isKrathongAppearance", () => {
  it("AR4 returns the frozen constants, null elsewhere", () => {
    expect(defaultEventAppearance("loy_krathong")).toBe(DEFAULT_KRATHONG_APPEARANCE);
    expect(defaultEventAppearance("christmas")).toBe(DEFAULT_ORNAMENT_APPEARANCE);
    for (const id of FESTIVAL_EVENT_IDS) {
      if (id !== "loy_krathong" && id !== "christmas") expect(defaultEventAppearance(id)).toBeNull();
    }
  });
  it("AR5 narrows by the own base key", () => {
    expect(isKrathongAppearance(DEFAULT_KRATHONG_APPEARANCE)).toBe(true);
    expect(isKrathongAppearance(DEFAULT_ORNAMENT_APPEARANCE)).toBe(false);
  });
});
