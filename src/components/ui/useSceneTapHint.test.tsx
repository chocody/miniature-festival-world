import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SCENE_TAP_HINT_SEEN_VALUE, SCENE_TAP_HINT_STORAGE_KEY } from "@/config/gimmicks.config";
import { markSceneTapHintSeen, readSceneTapHintSeen, useSceneTapHint } from "./useSceneTapHint";

beforeEach(() => localStorage.clear());

describe("scene tap hint storage helpers", () => {
  it("reads the seen flag defensively", () => {
    expect(readSceneTapHintSeen(null)).toBe(false);
    expect(readSceneTapHintSeen({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
    expect(readSceneTapHintSeen({ getItem: () => SCENE_TAP_HINT_SEEN_VALUE })).toBe(true);
    expect(readSceneTapHintSeen({ getItem: () => "0" })).toBe(false);
  });
  it("marks the flag without throwing", () => {
    expect(() => markSceneTapHintSeen(null)).not.toThrow();
    expect(() => markSceneTapHintSeen({ setItem: () => { throw new Error("full"); } })).not.toThrow();
    let written: [string, string] | null = null;
    markSceneTapHintSeen({ setItem: (k, v) => { written = [k, v]; } });
    expect(written).toEqual([SCENE_TAP_HINT_STORAGE_KEY, SCENE_TAP_HINT_SEEN_VALUE]);
  });
});

describe("useSceneTapHint", () => {
  it("is visible until dismissed, and remembers", () => {
    const { result } = renderHook(() => useSceneTapHint(true));
    expect(result.current.visible).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    expect(localStorage.getItem(SCENE_TAP_HINT_STORAGE_KEY)).toBe(SCENE_TAP_HINT_SEEN_VALUE);
  });
  it("keeps dismiss referentially stable", () => {
    const { result, rerender } = renderHook(({ active }) => useSceneTapHint(active), { initialProps: { active: true } });
    const first = result.current.dismiss;
    rerender({ active: false });
    expect(result.current.dismiss).toBe(first);
  });
  it("is never visible when inactive or already seen", () => {
    expect(renderHook(() => useSceneTapHint(false)).result.current.visible).toBe(false);
    localStorage.setItem(SCENE_TAP_HINT_STORAGE_KEY, SCENE_TAP_HINT_SEEN_VALUE);
    expect(renderHook(() => useSceneTapHint(true)).result.current.visible).toBe(false);
  });
});
