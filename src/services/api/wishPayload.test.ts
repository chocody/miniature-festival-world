// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WISH_TEXT_MAX_LENGTH } from "@/config/wish.config";
import {
  evaluateWishDraft,
  isWishVisibility,
  moderationReasonsFromServerBody,
  normalizeWishText,
  toWishColumns,
  toWishRequestFields,
} from "./wishPayload";

const CLEAN = "ขอให้ทุกคนมีความสุข";

const POSITIVE: readonly (readonly [string, readonly string[]])[] = [
  ["โทรหาฉัน 081-234-5678", ["phone"]],
  ["Call me 0812345678", ["phone"]],
  ["ติดต่อ a.b@example.com", ["email"]],
  ["ไลน์ myid123", ["line_id"]],
  ["ig: lantern_girl", ["social_handle"]],
  ["fuck this", ["profanity"]],
  ["ขอให้ครอบครัวแข็งแรง ไอ้สัตว์", ["profanity"]],
  ["ขอให้รวย โทร 0812345678 อีเมล me@example.com", ["phone", "email"]],
];
const NEGATIVE = [
  "ขอให้ปี 2569 ทุกคนมีความสุข",
  "Happy Loy Krathong everyone",
  "May all lanterns light the way in 2026",
  "ขอให้สอบผ่าน",
  CLEAN,
];

describe("isWishVisibility / normalizeWishText", () => {
  it("accepts only the two visibilities", () => {
    expect(isWishVisibility("private")).toBe(true);
    expect(isWishVisibility("public")).toBe(true);
    for (const v of ["Public", "anonymous", "", null, undefined, 1, {}]) expect(isWishVisibility(v)).toBe(false);
  });
  it("trims only the ends", () => {
    expect(normalizeWishText("  ขอให้มีความสุข \n")).toBe("ขอให้มีความสุข");
    expect(normalizeWishText("a\nb")).toBe("a\nb");
  });
});

describe("evaluateWishDraft", () => {
  it("visibility_missing when no choice", () => {
    expect(evaluateWishDraft({ text: CLEAN, visibility: null })).toEqual({
      ok: false,
      issues: ["visibility_missing"],
      moderationReasons: [],
    });
  });

  it("reports empty text", () => {
    const a = evaluateWishDraft({ text: "", visibility: null });
    expect(a.ok === false && a.issues).toEqual(["text_empty", "visibility_missing"]);
    const b = evaluateWishDraft({ text: "   \n ", visibility: "private" });
    expect(b.ok === false && b.issues).toEqual(["text_empty"]);
    const c = evaluateWishDraft({ text: "", visibility: "public" });
    expect(c.ok === false && c.issues).toEqual(["text_empty"]);
    expect(c.ok === false && c.moderationReasons).toEqual([]);
  });

  it.each(["private", "public"] as const)("accepts a valid %s wish, trimmed and frozen", (visibility) => {
    const result = evaluateWishDraft({ text: `  ${CLEAN}  `, visibility });
    expect(result).toEqual({ ok: true, wish: { text: CLEAN, visibility } });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.wish)).toBe(true);
  });

  it("enforces the length after trimming", () => {
    expect(evaluateWishDraft({ text: "ก".repeat(WISH_TEXT_MAX_LENGTH), visibility: "private" }).ok).toBe(true);
    const over = evaluateWishDraft({ text: "ก".repeat(WISH_TEXT_MAX_LENGTH + 1), visibility: "private" });
    expect(over.ok === false && over.issues).toEqual(["text_too_long"]);
    expect(evaluateWishDraft({ text: ` ${"ก".repeat(WISH_TEXT_MAX_LENGTH)} `, visibility: "private" }).ok).toBe(true);
    const both = evaluateWishDraft({ text: "โทร 0812345678 " + "ก".repeat(WISH_TEXT_MAX_LENGTH), visibility: "public" });
    expect(both.ok === false && both.issues).toEqual(["text_too_long", "moderation_blocked"]);
    expect(both.ok === false && both.moderationReasons).toEqual(["phone"]);
  });

  it.each(POSITIVE)("public %j is blocked", (text, reasons) => {
    const result = evaluateWishDraft({ text, visibility: "public" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(["moderation_blocked"]);
      expect(result.moderationReasons).toEqual(reasons);
    }
  });

  it.each(NEGATIVE)("public %j passes", (text) => {
    expect(evaluateWishDraft({ text, visibility: "public" }).ok).toBe(true);
  });

  it("private is not moderated", () => {
    for (const [text] of POSITIVE) {
      const result = evaluateWishDraft({ text, visibility: "private" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.wish.text).toBe(text.trim());
    }
  });

  it("throws TypeError for malformed drafts without leaking the text", () => {
    expect(() => evaluateWishDraft({ text: 42 as never, visibility: "private" })).toThrow(TypeError);
    expect(() => evaluateWishDraft({ text: "secret-wish", visibility: "everyone" as never })).toThrow(TypeError);
    try {
      evaluateWishDraft({ text: "secret-wish", visibility: "everyone" as never });
    } catch (e) {
      expect((e as Error).message).not.toContain("secret-wish");
    }
  });
});

describe("column and request mapping", () => {
  it("toWishColumns: public text only in the public column", () => {
    const cols = toWishColumns({ text: CLEAN, visibility: "public" });
    expect(cols).toEqual({ publicWishText: CLEAN, privateWishPlaintext: null });
    expect(Object.keys(cols)).toEqual(["publicWishText", "privateWishPlaintext"]);
  });

  it("toWishColumns: private text only in the private column", () => {
    const text = "อยากปล่อยวางเรื่องเก่า";
    const cols = toWishColumns({ text, visibility: "private" });
    expect(cols).toEqual({ publicWishText: null, privateWishPlaintext: text });
    expect(JSON.stringify(cols.publicWishText)).not.toContain(text);
    for (const visibility of ["private", "public"] as const) {
      const c = toWishColumns({ text, visibility });
      expect(Object.values(c).filter((v) => v !== null)).toHaveLength(1);
    }
    expect(() => toWishColumns({ text: "x", visibility: "both" as never })).toThrow(TypeError);
  });

  it("toWishRequestFields has exactly the 2.4 keys", () => {
    const f = toWishRequestFields({ text: "t", visibility: "private" });
    expect(f).toEqual({ wishText: "t", wishVisibility: "private" });
    expect(Object.keys(f)).toEqual(["wishText", "wishVisibility"]);
  });
});

describe("moderationReasonsFromServerBody", () => {
  it("returns canonical reasons", () => {
    expect(moderationReasonsFromServerBody({ error: "moderation_blocked", reasons: ["email", "phone"] })).toEqual([
      "phone",
      "email",
    ]);
  });
  it.each([
    null,
    "moderation_blocked",
    { error: "x", reasons: ["phone"] },
    { error: "moderation_blocked", reasons: [] },
    { error: "moderation_blocked", reasons: ["unknown"] },
    { error: "unavailable" },
  ])("returns null for %j", (body) => {
    expect(moderationReasonsFromServerBody(body)).toBeNull();
  });
});
