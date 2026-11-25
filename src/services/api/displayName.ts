// MFW-62 (backlog 12.1): optional display name shown next to an open wish (owner decisions 29 and 36).
// Pure and isomorphic: used by the server create / switch paths and, later, by the client (MFW-63). No server imports.
import { DISPLAY_NAME_FORBIDDEN_PATTERN, DISPLAY_NAME_MAX_LENGTH } from "@/config/wish.config";
import { checkPublicWish, type ModerationReason } from "@/services/moderation";

export type DisplayNameIssue = "name_too_long" | "name_invalid" | "moderation_blocked";
export type DisplayNameEvaluation =
  | { readonly ok: true; readonly name: string | null }
  | {
      readonly ok: false;
      readonly issue: DisplayNameIssue;
      /** Non-empty only for "moderation_blocked". */
      readonly moderationReasons: readonly ModerationReason[];
    };

const NO_REASONS: readonly ModerationReason[] = Object.freeze([]);
const UNNAMED: DisplayNameEvaluation = Object.freeze({ ok: true as const, name: null });

/** Trims; "" after trim → null; null/undefined → null. Inner text unchanged. Throws TypeError for any other type. */
export function normalizeDisplayName(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw new TypeError("display name must be a string");
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function failed(issue: DisplayNameIssue, moderationReasons: readonly ModerationReason[] = NO_REASONS): DisplayNameEvaluation {
  return Object.freeze({ ok: false as const, issue, moderationReasons });
}

/**
 * normalize → null ⇒ ok with null; too long ⇒ name_too_long; control character ⇒ name_invalid;
 * the public-wish guard (PII + profanity, Thai and English) fails ⇒ moderation_blocked with its reasons; else ok with the name.
 * Frozen results. Throws TypeError (no value in the message) for a non-string, non-null input.
 */
export function evaluateDisplayName(raw: string | null | undefined): DisplayNameEvaluation {
  const name = normalizeDisplayName(raw);
  if (name === null) return UNNAMED;
  if (name.length > DISPLAY_NAME_MAX_LENGTH) return failed("name_too_long");
  if (DISPLAY_NAME_FORBIDDEN_PATTERN.test(name)) return failed("name_invalid");
  const guard = checkPublicWish(name);
  if (!guard.ok) return failed("moderation_blocked", Object.freeze([...guard.reasons]));
  return Object.freeze({ ok: true as const, name });
}

/** True only for a non-null string that evaluateDisplayName accepts unchanged (already trimmed). Never throws. */
export function isStorableDisplayName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const evaluation = evaluateDisplayName(value);
  return evaluation.ok && evaluation.name === value;
}
