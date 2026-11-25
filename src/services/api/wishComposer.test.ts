// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/config/wish.config";
import { evaluateWishComposer, wishVisibilityOf, type WishComposerDraft } from "./wishComposer";

const CLEAN = "ขอให้ทุกคนมีความสุข";
const PHONE = "โทรหาฉัน 081-234-5678";
const draft = (patch: Partial<WishComposerDraft> = {}): WishComposerDraft => ({ text: CLEAN, open: false, displayName: null, ...patch });

describe("wishVisibilityOf", () => {
  it("maps the switch to the visibility", () => {
    expect(wishVisibilityOf(true)).toBe("public");
    expect(wishVisibilityOf(false)).toBe("private");
  });
});

describe("evaluateWishComposer", () => {
  it("off + clean text + a name → private wish with the trimmed name", () => {
    const r = evaluateWishComposer(draft({ displayName: "  น้องมะลิ " }));
    expect(r).toEqual({ ok: true, wish: { text: CLEAN, visibility: "private" }, displayName: "น้องมะลิ" });
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("on → public; empty, blank or null names → null", () => {
    for (const displayName of ["", "   ", null]) {
      const r = evaluateWishComposer(draft({ open: true, displayName }));
      expect(r).toEqual({ ok: true, wish: { text: CLEAN, visibility: "public" }, displayName: null });
    }
  });

  it("a phone number in the wish blocks only when on", () => {
    const on = evaluateWishComposer(draft({ open: true, text: PHONE }));
    expect(on.ok).toBe(false);
    if (!on.ok) {
      expect(on.issues).toEqual(["wish_blocked"]);
      expect(on.wishModerationReasons).toEqual(["phone"]);
      expect(on.nameModerationReasons).toEqual([]);
    }
    expect(evaluateWishComposer(draft({ open: false, text: PHONE })).ok).toBe(true);
  });

  it("the name is moderated even with the switch off (Thai LINE id, English email)", () => {
    const thai = evaluateWishComposer(draft({ displayName: "ไลน์ somchai99" }));
    expect(thai.ok).toBe(false);
    if (!thai.ok) {
      expect(thai.issues).toEqual(["name_blocked"]);
      expect(thai.nameModerationReasons).toEqual(["line_id"]);
      expect(thai.wishModerationReasons).toEqual([]);
    }
    const english = evaluateWishComposer(draft({ displayName: "someone@example.com" }));
    expect(english.ok).toBe(false);
    if (!english.ok) {
      expect(english.issues).toEqual(["name_blocked"]);
      expect(english.nameModerationReasons).toEqual(["email"]);
    }
    expect(evaluateWishComposer(draft({ displayName: "น้องมะลิ" })).ok).toBe(true);
    expect(evaluateWishComposer(draft({ displayName: "Mali" })).ok).toBe(true);
  });

  it("name length and control characters", () => {
    const long = evaluateWishComposer(draft({ displayName: "ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }));
    expect(long.ok === false && long.issues).toEqual(["name_too_long"]);
    const ctrl = evaluateWishComposer(draft({ displayName: "a\tb" }));
    expect(ctrl.ok === false && ctrl.issues).toEqual(["name_invalid"]);
    expect(evaluateWishComposer(draft({ displayName: "ก".repeat(DISPLAY_NAME_MAX_LENGTH) })).ok).toBe(true);
  });

  it("issues come in WISH_COMPOSER_ISSUES order; results and arrays are frozen", () => {
    const r = evaluateWishComposer(draft({ text: "  ", displayName: "ก".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toEqual(["name_too_long", "text_empty"]);
      expect(Object.isFrozen(r)).toBe(true);
      expect(Object.isFrozen(r.issues)).toBe(true);
      expect(Object.isFrozen(r.wishModerationReasons)).toBe(true);
      expect(Object.isFrozen(r.nameModerationReasons)).toBe(true);
    }
    const both = evaluateWishComposer(draft({ open: true, text: PHONE, displayName: "someone@example.com" }));
    expect(both.ok === false && both.issues).toEqual(["name_blocked", "wish_blocked"]);
  });

  it("malformed drafts throw TypeError without the value", () => {
    expect(() => evaluateWishComposer({ text: CLEAN, open: "yes" as unknown as boolean, displayName: null })).toThrow(TypeError);
    expect(() => evaluateWishComposer({ text: 42 as unknown as string, open: false, displayName: null })).toThrow(TypeError);
    expect(() => evaluateWishComposer({ text: CLEAN, open: false, displayName: 7 as unknown as string })).toThrow(TypeError);
    try {
      evaluateWishComposer({ text: CLEAN, open: "secret-flag" as unknown as boolean, displayName: null });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("secret-flag");
    }
  });
});
