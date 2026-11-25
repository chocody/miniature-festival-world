import { describe, expect, it } from "vitest";
import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { PRIMARY_ACTION_PROPS, UI_CLASSES, UI_GLYPHS } from "./uiClasses";

describe("UI_CLASSES (MFW-55)", () => {
  it("every control recipe is at least 44 px", () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44); // min-h-11 / min-w-11 = 2.75rem = 44 px
    for (const key of ["primaryButton", "secondaryButton", "ghostButton", "iconButton", "chip", "listRow", "field"] as const) {
      const classes = UI_CLASSES[key].split(/\s+/);
      expect(classes, key).toContain("min-h-11");
      expect(classes, key).toContain("min-w-11");
    }
  });

  it("no recipe animates", () => {
    for (const [key, value] of Object.entries(UI_CLASSES)) expect(value, key).not.toMatch(/transition|animate-/);
  });

  it("primary marker", () => {
    expect(PRIMARY_ACTION_PROPS).toEqual({ "data-ui-emphasis": "primary" });
    const withClayFill = Object.entries(UI_CLASSES)
      .filter(([, value]) => `${value} `.includes("bg-clay "))
      .map(([key]) => key);
    expect(withClayFill).toEqual(["primaryButton"]);
  });

  it("recipes and glyphs are frozen", () => {
    expect(Object.isFrozen(UI_CLASSES)).toBe(true);
    expect(Object.isFrozen(PRIMARY_ACTION_PROPS)).toBe(true);
    expect(Object.isFrozen(UI_GLYPHS)).toBe(true);
  });
});
