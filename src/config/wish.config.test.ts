// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  WISH_COPY,
  WISH_DRAFT_ISSUES,
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

  it("option labels are the spec words", () => {
    expect(WISH_COPY.options.private.label).toBe("เก็บข้อความเป็นส่วนตัว");
    expect(WISH_COPY.options.public.label).toBe("เผยแพร่แบบไม่ระบุตัวตน (Anonymous)");
    expect(Object.keys(WISH_COPY.options)).toEqual([...WISH_VISIBILITIES]);
  });

  it("issue copy covers every non-moderation issue", () => {
    expect(Object.keys(WISH_COPY.issues).sort()).toEqual(
      WISH_DRAFT_ISSUES.filter((i) => i !== "moderation_blocked").sort(),
    );
    for (const text of Object.values(WISH_COPY.issues)) expect(text.length).toBeGreaterThan(0);
  });

  it("limits are positive integers and the submit label matches the flow", () => {
    expect(Number.isInteger(WISH_TEXT_MAX_LENGTH) && WISH_TEXT_MAX_LENGTH > 0).toBe(true);
    expect(Number.isInteger(WISH_TEXTAREA_ROWS) && WISH_TEXTAREA_ROWS > 0).toBe(true);
    expect(WISH_COPY.submit).toBe("ถัดไป");
  });
});
