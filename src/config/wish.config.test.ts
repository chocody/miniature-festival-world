// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_FALLBACK,
  WISH_COMPOSER_ISSUES,
  WISH_COPY,
  WISH_DRAFT_ISSUES,
  WISH_SWITCH_COPY,
  WISH_TEXTAREA_ROWS,
  WISH_TEXT_MAX_LENGTH,
  WISH_VISIBILITIES,
} from "./wish.config";

describe("wish.config", () => {
  it("lists are exact and frozen", () => {
    expect([...WISH_VISIBILITIES]).toEqual(["private", "public"]);
    expect(Object.isFrozen(WISH_VISIBILITIES)).toBe(true);
    expect([...WISH_DRAFT_ISSUES]).toEqual(["text_empty", "text_too_long", "visibility_missing", "moderation_blocked"]);
    expect(Object.isFrozen(WISH_DRAFT_ISSUES)).toBe(true);
  });

  it("switch label and name fallback are the spec words (owner decisions 29 and 36)", () => {
    expect(WISH_SWITCH_COPY.label).toBe("เปิดให้ทุกคนเห็น");
    expect(DISPLAY_NAME_FALLBACK).toBe("ไม่ระบุชื่อ");
    expect(WISH_SWITCH_COPY.helper.length).toBeGreaterThan(0);
    expect(Object.isFrozen(WISH_SWITCH_COPY)).toBe(true);
  });

  it("composer issues are exact and frozen", () => {
    expect([...WISH_COMPOSER_ISSUES]).toEqual([
      "name_too_long",
      "name_invalid",
      "name_blocked",
      "text_empty",
      "text_too_long",
      "wish_blocked",
    ]);
    expect(Object.isFrozen(WISH_COMPOSER_ISSUES)).toBe(true);
  });

  it("issue copy covers every non-moderation composer issue", () => {
    expect(Object.keys(WISH_COPY.issues).sort()).toEqual(
      WISH_COMPOSER_ISSUES.filter((i) => i !== "name_blocked" && i !== "wish_blocked").sort(),
    );
    for (const text of Object.values(WISH_COPY.issues)) expect(text.length).toBeGreaterThan(0);
  });

  it("limits are positive integers and the submit label matches the flow", () => {
    expect(Number.isInteger(WISH_TEXT_MAX_LENGTH) && WISH_TEXT_MAX_LENGTH > 0).toBe(true);
    expect(Number.isInteger(WISH_TEXTAREA_ROWS) && WISH_TEXTAREA_ROWS > 0).toBe(true);
    expect(WISH_COPY.submit).toBe("ถัดไป");
  });
});
