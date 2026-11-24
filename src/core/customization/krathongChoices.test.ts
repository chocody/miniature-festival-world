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
  ALL_RIM_SOCKETS,
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  getFlowerSelection,
  krathongAppearanceEquals,
  parseKrathongAppearance,
  type CandleColor,
  type KrathongAppearance,
  type KrathongChoice,
} from "./index";

const D = DEFAULT_KRATHONG_APPEARANCE;

/** Applies a choice, checks the input was not mutated and that an ok result passes the strict parser. */
function apply(appearance: KrathongAppearance, choice: KrathongChoice) {
  const before = structuredClone(appearance);
  const result = applyKrathongChoice(appearance, choice);
  expect(appearance).toEqual(before);
  if (result.ok) expect(parseKrathongAppearance(result.appearance)).toEqual({ ok: true, appearance: result.appearance });
  return result;
}

describe("applyKrathongChoice", () => {
  it.each(KRATHONG_BASE_IDS)("base %s", (id) => {
    const r = apply(D, { part: "base", value: id });
    expect(r).toEqual({ ok: true, appearance: { ...D, base: id } });
  });

  it.each(LEAF_FOLD_STYLE_IDS)("lotusFold %s", (id) => {
    expect(apply(D, { part: "lotusFold", value: id })).toEqual({ ok: true, appearance: { ...D, lotusFold: id } });
  });

  it.each(LEAF_COLOR_PALETTE)("leafColor %s", (c) => {
    expect(apply(D, { part: "leafColor", value: c })).toEqual({ ok: true, appearance: { ...D, leafColor: c } });
  });

  it.each(CANDLE_COLOR_PALETTE)("candleColor %s", (c) => {
    expect(apply(D, { part: "candleColor", value: c })).toEqual({ ok: true, appearance: { ...D, candleColor: c } });
  });

  it("canonicalizes a lowercase colour", () => {
    const r = apply(D, { part: "candleColor", value: "#ffd166" as CandleColor });
    expect(r.ok && r.appearance.candleColor).toBe("#FFD166");
  });

  it.each(FLOWER_KINDS)("fills every rim socket with %s", (kind) => {
    const r = apply({ ...D, flowers: [] }, { part: "flower", target: ALL_RIM_SOCKETS, value: kind });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appearance.flowers).toHaveLength(RIM_SOCKET_COUNT);
      expect(r.appearance.flowers.every((f) => f === kind)).toBe(true);
    }
  });

  it("empties every rim socket with null", () => {
    const r = apply(D, { part: "flower", target: ALL_RIM_SOCKETS, value: null });
    expect(r.ok && r.appearance.flowers).toEqual([]);
  });

  it("places and clears a single socket", () => {
    const placed = apply({ ...D, flowers: [] }, { part: "flower", target: "rim_socket_3", value: "orchid" });
    expect(placed.ok && placed.appearance.flowers).toEqual([null, null, null, "orchid"]);
    if (!placed.ok) return;
    const cleared = apply(placed.appearance, { part: "flower", target: "rim_socket_3", value: null });
    expect(cleared.ok && cleared.appearance.flowers).toEqual([]);
  });

  it("rejects values outside the catalogue and bad sockets", () => {
    expect(apply(D, { part: "base", value: "x" as never })).toEqual({
      ok: false,
      reason: "base is not a known krathong base",
    });
    expect(apply(D, { part: "flower", target: "rim_socket_99" as never, value: "orchid" })).toEqual({
      ok: false,
      reason: "socket rule: UNKNOWN_SOCKET at rim_socket_99",
    });
    expect(apply(D, { part: "flower", target: "center_socket" as never, value: null })).toEqual({
      ok: false,
      reason: "socket rule: CANDLE_REQUIRED at center_socket",
    });
    expect(apply(D, { part: "nope" } as never)).toEqual({ ok: false, reason: "unknown choice part" });
  });
});

describe("krathongAppearanceEquals", () => {
  it("compares canonical forms", () => {
    expect(krathongAppearanceEquals(D, { ...D, flowers: [...D.flowers] })).toBe(true);
    expect(krathongAppearanceEquals({ ...D, flowers: ["orchid", null] }, { ...D, flowers: ["orchid"] })).toBe(true);
    expect(krathongAppearanceEquals(D, { ...D, base: "toy_bread_01" })).toBe(false);
    expect(krathongAppearanceEquals(D, { ...D, lotusFold: "style_02" })).toBe(false);
    expect(krathongAppearanceEquals(D, { ...D, leafColor: "#3F6B4A" })).toBe(false);
    expect(krathongAppearanceEquals(D, { ...D, flowers: ["orchid"] })).toBe(false);
    expect(krathongAppearanceEquals(D, { ...D, candleColor: "#FF9F6B" })).toBe(false);
  });
});

describe("getFlowerSelection", () => {
  it("summarises all rim sockets", () => {
    expect(getFlowerSelection(D, ALL_RIM_SOCKETS)).toBe("marigold");
    expect(getFlowerSelection({ ...D, flowers: [] }, ALL_RIM_SOCKETS)).toBeNull();
    expect(getFlowerSelection({ ...D, flowers: ["orchid"] }, ALL_RIM_SOCKETS)).toBe("MIXED");
  });

  it("reads one rim socket", () => {
    const a = { ...D, flowers: ["orchid" as const] };
    expect(getFlowerSelection(a, "rim_socket_0")).toBe("orchid");
    expect(getFlowerSelection(a, "rim_socket_5")).toBeNull();
  });

  it("throws RangeError for a non-rim socket", () => {
    expect(() => getFlowerSelection(D, "center_socket" as never)).toThrow(RangeError);
    expect(() => getFlowerSelection(D, "rim_socket_99" as never)).toThrow(RangeError);
  });
});
