import { MODERATION_COPY, MODERATION_REASONS, type ModerationReason } from "@/config/moderation.config";
import { detectPii } from "./piiDetector";
import { containsProfanity } from "./profanityFilter";
import type { ModerationBlockedBody, ModerationWarning, WishGuardResult } from "./types";

const OK: WishGuardResult = Object.freeze({ ok: true });

/** The 2.3 guard for public_wish_text (PII + profanity, owner decision 13). Throws TypeError for a non-string. */
export function checkPublicWish(text: string): WishGuardResult {
  if (typeof text !== "string") throw new TypeError("wish text must be a string");
  const pii = detectPii(text);
  const profane = containsProfanity(text);
  const reasons = MODERATION_REASONS.filter((r) => (r === "profanity" ? profane : pii.includes(r)));
  return reasons.length === 0 ? OK : Object.freeze({ ok: false as const, reasons: Object.freeze(reasons) });
}

export function isModerationReason(value: unknown): value is ModerationReason {
  return typeof value === "string" && (MODERATION_REASONS as readonly string[]).includes(value);
}

/** Keeps only known reasons, unique, in MODERATION_REASONS order. */
function canonicalReasons(reasons: readonly unknown[]): ModerationReason[] {
  return MODERATION_REASONS.filter((r) => reasons.includes(r));
}

/** Thai warning for the given reasons (unknown entries ignored). */
export function describeModerationReasons(reasons: readonly ModerationReason[]): ModerationWarning {
  return Object.freeze({
    title: MODERATION_COPY.blockedTitle,
    messages: Object.freeze(canonicalReasons(reasons).map((r) => MODERATION_COPY.reasons[r])),
    hint: MODERATION_COPY.fixHint,
  });
}

export function toModerationBlockedBody(reasons: readonly ModerationReason[]): ModerationBlockedBody {
  return { error: "moderation_blocked", reasons: canonicalReasons(reasons) };
}

/** Client-side parse of an untrusted server error body. null unless it is exactly a valid ModerationBlockedBody shape. */
export function parseModerationBlockedBody(value: unknown): ModerationBlockedBody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { error, reasons } = value as { error?: unknown; reasons?: unknown };
  if (error !== "moderation_blocked" || !Array.isArray(reasons) || reasons.length === 0) return null;
  if (!reasons.every(isModerationReason)) return null;
  return { error: "moderation_blocked", reasons: canonicalReasons(reasons) };
}
