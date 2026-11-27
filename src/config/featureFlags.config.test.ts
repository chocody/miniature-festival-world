import { describe, expect, it } from "vitest";
import { FESTIVAL_EVENT_IDS } from "./events";
import { EVENT_FEATURE_FLAGS, isEventEnabled } from "./featureFlags.config";

describe("featureFlags.config", () => {
  it("enables exactly loy_krathong and christmas", () => {
    expect(Object.keys(EVENT_FEATURE_FLAGS).sort()).toEqual([...FESTIVAL_EVENT_IDS].sort());
    const enabled = Object.entries(EVENT_FEATURE_FLAGS).filter(([, v]) => v);
    expect(enabled).toEqual([
      ["loy_krathong", true],
      ["christmas", true],
    ]);
  });

  it("isEventEnabled is true only for own true flags", () => {
    expect(isEventEnabled("loy_krathong")).toBe(true);
    expect(isEventEnabled("christmas")).toBe(true);
    expect(isEventEnabled("new_year")).toBe(false);
    expect(isEventEnabled("unknown")).toBe(false);
    expect(isEventEnabled("__proto__")).toBe(false);
    expect(isEventEnabled("toString")).toBe(false);
    expect(isEventEnabled("christmas", { ...EVENT_FEATURE_FLAGS, christmas: false })).toBe(false);
  });
});
