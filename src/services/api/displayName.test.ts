import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/config/wish.config";
import { evaluateDisplayName, isStorableDisplayName, normalizeDisplayName } from "./displayName";

describe("normalizeDisplayName (MFW-62)", () => {
  it("trims and maps empty to null", () => {
    expect(normalizeDisplayName("  สมชาย  ")).toBe("สมชาย");
    expect(normalizeDisplayName("น้อง  มะลิ")).toBe("น้อง  มะลิ");
    for (const v of ["", "   ", null, undefined]) expect(normalizeDisplayName(v)).toBeNull();
  });
  it("throws a TypeError without the value for a non-string", () => {
    let caught: unknown;
    try {
      normalizeDisplayName(123 as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect(String((caught as Error).message)).not.toContain("123");
    expect(() => evaluateDisplayName({} as never)).toThrow(TypeError);
  });
});

describe("evaluateDisplayName (MFW-62)", () => {
  it("accepts clean names, trimmed", () => {
    for (const name of ["สมชาย", "Mali", "น้องมะลิ 2569"]) {
      expect(evaluateDisplayName(`  ${name} `)).toEqual({ ok: true, name });
    }
    expect(evaluateDisplayName(null)).toEqual({ ok: true, name: null });
    expect(evaluateDisplayName("   ")).toEqual({ ok: true, name: null });
    expect(Object.isFrozen(evaluateDisplayName("Mali"))).toBe(true);
  });
  it("enforces the length limit from config", () => {
    expect(evaluateDisplayName("ก".repeat(DISPLAY_NAME_MAX_LENGTH))).toEqual({
      ok: true,
      name: "ก".repeat(DISPLAY_NAME_MAX_LENGTH),
    });
    expect(evaluateDisplayName("ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      issue: "name_too_long",
      moderationReasons: [],
    });
  });
  it("rejects control characters", () => {
    for (const name of ["a\nb", "a\tb", "a\u0000b"]) {
      expect(evaluateDisplayName(name)).toMatchObject({ ok: false, issue: "name_invalid", moderationReasons: [] });
    }
  });
  it("runs the public-wish guard (Thai and English)", () => {
    const cases: [string, string[]][] = [
      ["0812345678", ["phone"]],
      ["me@example.com", ["email"]],
      ["ไลน์ somchai99", ["line_id"]],
      ["@somchai_j", ["social_handle"]],
      ["เหี้ย", ["profanity"]],
      ["fuck", ["profanity"]],
    ];
    for (const [name, reasons] of cases) {
      const r = evaluateDisplayName(name);
      expect(r).toEqual({ ok: false, issue: "moderation_blocked", moderationReasons: reasons });
      expect(Object.isFrozen(r)).toBe(true);
    }
  });
});

describe("isStorableDisplayName (MFW-62)", () => {
  it("is true only for an accepted, already trimmed name", () => {
    expect(isStorableDisplayName("สมชาย")).toBe(true);
    for (const v of [" สมชาย", "", null, 5, undefined, "me@example.com", "ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1), "a\nb"]) {
      expect(isStorableDisplayName(v)).toBe(false);
    }
  });
});
