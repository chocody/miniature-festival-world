import { describe, expect, it } from "vitest";
import { parseEventAppearance } from "./appearanceRegistry";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";

describe("parseEventAppearance", () => {
  it("parses Loy Krathong appearances", () => {
    expect(parseEventAppearance("loy_krathong", DEFAULT_KRATHONG_APPEARANCE).ok).toBe(true);
    expect(parseEventAppearance("loy_krathong", { base: "x" })).toEqual(parseKrathongAppearance({ base: "x" }));
    expect(parseEventAppearance("loy_krathong", { base: "x" }).ok).toBe(false);
  });
  it("rejects stub events", () => {
    expect(parseEventAppearance("christmas", {})).toEqual({
      ok: false,
      reason: "no appearance schema for event: christmas",
    });
  });
  it("never throws", () => {
    for (const input of [undefined, null, () => {}, Symbol("x")]) {
      expect(() => parseEventAppearance("loy_krathong", input)).not.toThrow();
    }
  });
});
