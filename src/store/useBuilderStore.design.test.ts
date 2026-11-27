import { beforeEach, describe, expect, it } from "vitest";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  DEFAULT_ORNAMENT_APPEARANCE,
  DEFAULT_STAR_APPEARANCE,
} from "@/core/customization";
import { selectBuilderAppearance, useBuilderStore } from "./useBuilderStore";

const { getState, setState, getInitialState } = useBuilderStore;
beforeEach(() => {
  setState(getInitialState(), true);
});

describe("useBuilderStore.chooseDesign (MFW-92, MFW-131)", () => {
  it("BD1 starts with defaults per event", () => {
    expect(getState().ornamentAppearance).toBeNull();
    expect(selectBuilderAppearance(getState(), "christmas")).toBe(DEFAULT_ORNAMENT_APPEARANCE);
    expect(selectBuilderAppearance(getState(), "loy_krathong")).toBe(DEFAULT_KRATHONG_APPEARANCE);
    expect(getState().starAppearance).toBeNull();
    expect(selectBuilderAppearance(getState(), "new_year")).toBe(DEFAULT_STAR_APPEARANCE);
    expect(selectBuilderAppearance(getState(), "chinese_new_year")).toBeNull();
  });
  it("BD2 chooses an ornament design and leaves Loy untouched", () => {
    expect(getState().chooseDesign("christmas", "star_01")).toEqual({ ok: true, appearance: { design: "star_01" } });
    expect(getState().ornamentAppearance).toEqual({ design: "star_01" });
    expect(getState().appearance).toBeNull();
    expect(selectBuilderAppearance(getState(), "christmas")).toEqual({ design: "star_01" });
  });
  it("BD3 a no-op keeps the state reference", () => {
    let before = getState();
    expect(getState().chooseDesign("christmas", "ball_01").ok).toBe(true);
    expect(getState()).toBe(before);
    getState().chooseDesign("christmas", "star_01");
    before = getState();
    expect(getState().chooseDesign("christmas", "star_01").ok).toBe(true);
    expect(getState()).toBe(before);
  });
  it("BD4 rejects an unknown ornament design", () => {
    const before = getState();
    for (const d of ["naga_01", "BALL_01"]) {
      expect(getState().chooseDesign("christmas", d)).toEqual({ ok: false, reason: "design is not a known ornament design" });
      expect(getState()).toBe(before);
    }
  });
  it("BD5 loy_krathong behaves as chooseKrathong", () => {
    expect(getState().chooseDesign("loy_krathong", "lotus_bud_01").ok).toBe(true);
    const expected = applyKrathongChoice(DEFAULT_KRATHONG_APPEARANCE, { part: "design", value: "lotus_bud_01" });
    expect(expected.ok).toBe(true);
    if (expected.ok) expect(getState().appearance).toEqual(expected.appearance);
    expect(getState().ornamentAppearance).toBeNull();
    const before = getState();
    expect(getState().chooseDesign("loy_krathong", "ball_01")).toEqual({
      ok: false,
      reason: "design is not a known krathong design",
    });
    expect(getState()).toBe(before);
  });
  it("BD6 refuses an event without a schema", () => {
    const before = getState();
    expect(getState().chooseDesign("chinese_new_year", "ball_01")).toEqual({
      ok: false,
      reason: "no appearance schema for event: chinese_new_year",
    });
    expect(getState()).toBe(before);
  });
  it("BD7 chooses a star design for new_year and leaves the others untouched", () => {
    expect(getState().chooseDesign("new_year", "star_comet_01")).toEqual({ ok: true, appearance: { design: "star_comet_01" } });
    expect(getState().starAppearance).toEqual({ design: "star_comet_01" });
    expect(getState().ornamentAppearance).toBeNull();
    expect(getState().appearance).toBeNull();
    expect(selectBuilderAppearance(getState(), "new_year")).toEqual({ design: "star_comet_01" });
  });
  it("BD8 a star no-op keeps the state reference", () => {
    let before = getState();
    expect(getState().chooseDesign("new_year", "star_classic_01").ok).toBe(true);
    expect(getState()).toBe(before);
    getState().chooseDesign("new_year", "star_sparkle_01");
    before = getState();
    expect(getState().chooseDesign("new_year", "star_sparkle_01").ok).toBe(true);
    expect(getState()).toBe(before);
  });
  it("BD9 rejects designs of another event", () => {
    const before = getState();
    for (const d of ["star_01", "ball_01", "STAR_CLASSIC_01"]) {
      expect(getState().chooseDesign("new_year", d)).toEqual({ ok: false, reason: "design is not a known star design" });
      expect(getState()).toBe(before);
    }
    expect(getState().chooseDesign("christmas", "star_classic_01")).toEqual({ ok: false, reason: "design is not a known ornament design" });
    expect(getState()).toBe(before);
    expect(getState().chooseDesign("loy_krathong", "star_classic_01")).toEqual({ ok: false, reason: "design is not a known krathong design" });
    expect(getState()).toBe(before);
  });
});
