// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MODERATION_COPY, MODERATION_REASONS, type ModerationReason } from "@/config/moderation.config";
import {
  checkPublicWish,
  describeModerationReasons,
  isModerationReason,
  parseModerationBlockedBody,
  toModerationBlockedBody,
} from "./wishGuard";

describe("checkPublicWish", () => {
  it("accepts normal Thai and English wishes", () => {
    expect(checkPublicWish("ขอให้ทุกคนมีความสุข")).toEqual({ ok: true });
    expect(checkPublicWish("May all my wishes come true")).toEqual({ ok: true });
  });

  it("reports reasons in MODERATION_REASONS order", () => {
    expect(checkPublicWish("โทร 0812345678")).toEqual({ ok: false, reasons: ["phone"] });
    expect(checkPublicWish("ไอ้เหี้ย ig: somchai")).toEqual({ ok: false, reasons: ["social_handle", "profanity"] });
  });

  it.each<[ModerationReason, string, string]>([
    ["phone", "โทร 081-234-5678", "call 0812345678"],
    ["email", "somchai แอท gmail ดอท com", "somchai@gmail.com"],
    ["line_id", "ไลน์ somchai99", "line: somchai99"],
    ["social_handle", "เฟส: somchai.j", "ig: somchai.j"],
    ["profanity", "ไอ้เหี้ย", "fuck you"],
  ])("blocks %s in Thai and English", (reason, thai, english) => {
    for (const text of [thai, english]) {
      const r = checkPublicWish(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reasons).toContain(reason);
    }
  });

  it("throws TypeError for a non-string without echoing it", () => {
    let message = "";
    try {
      checkPublicWish(5 as unknown as string);
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError);
      message = (err as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("5");
  });
});

describe("warning copy and blocked body", () => {
  it("describeModerationReasons", () => {
    expect(describeModerationReasons(["profanity", "phone", "phone"])).toEqual({
      title: MODERATION_COPY.blockedTitle,
      messages: [MODERATION_COPY.reasons.phone, MODERATION_COPY.reasons.profanity],
      hint: MODERATION_COPY.fixHint,
    });
  });

  it("toModerationBlockedBody never echoes the text", () => {
    expect(toModerationBlockedBody(["email"])).toEqual({ error: "moderation_blocked", reasons: ["email"] });
    const text = "somchai@gmail.com";
    const guard = checkPublicWish(text);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(JSON.stringify(toModerationBlockedBody(guard.reasons))).not.toContain("somchai");
  });

  it("parseModerationBlockedBody", () => {
    const valid = { error: "moderation_blocked", reasons: ["phone", "profanity"] };
    expect(parseModerationBlockedBody(valid)).toEqual(valid);
    expect(parseModerationBlockedBody({ error: "moderation_blocked", reasons: [] })).toBeNull();
    expect(parseModerationBlockedBody({ error: "moderation_blocked", reasons: ["phone", "other"] })).toBeNull();
    for (const bad of [null, [], "x", { error: "x", reasons: ["phone"] }]) {
      expect(parseModerationBlockedBody(bad)).toBeNull();
    }
  });

  it("isModerationReason", () => {
    for (const r of MODERATION_REASONS) expect(isModerationReason(r)).toBe(true);
    expect(isModerationReason("nope")).toBe(false);
    expect(isModerationReason(1)).toBe(false);
  });
});
