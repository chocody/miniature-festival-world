import {
  WISH_DRAFT_ISSUES,
  WISH_TEXT_MAX_LENGTH,
  WISH_VISIBILITIES,
  type WishDraftIssue,
  type WishVisibility,
} from "@/config/wish.config";
import { checkPublicWish, parseModerationBlockedBody, type ModerationReason } from "@/services/moderation";

export type { WishDraftIssue, WishVisibility } from "@/config/wish.config";

/** What the user is typing in the WishModal. `visibility` stays null until the user picks one (explicit choice). */
export interface WishDraft {
  readonly text: string;
  readonly visibility: WishVisibility | null;
}

/** A wish that passed evaluateWishDraft: trimmed, non-empty, within the limit and, when public, through the 2.3 guard. */
export interface ComposedWish {
  readonly text: string;
  readonly visibility: WishVisibility;
}

export type WishDraftEvaluation =
  | { readonly ok: true; readonly wish: ComposedWish }
  | {
      readonly ok: false;
      readonly issues: readonly WishDraftIssue[]; // non-empty, unique, WISH_DRAFT_ISSUES order
      readonly moderationReasons: readonly ModerationReason[]; // non-empty only with "moderation_blocked"
    };

/** The two wish columns of a creation. Exactly one is non-null. The server encrypts privateWishPlaintext before storage. */
export interface WishColumns {
  readonly publicWishText: string | null;
  readonly privateWishPlaintext: string | null;
}

/** Wish fields of the POST /api/creations JSON body (backlog 2.4 AC1). */
export interface WishRequestFields {
  readonly wishText: string;
  readonly wishVisibility: WishVisibility;
}

const NO_REASONS: readonly ModerationReason[] = Object.freeze([]);

export function isWishVisibility(value: unknown): value is WishVisibility {
  return typeof value === "string" && (WISH_VISIBILITIES as readonly string[]).includes(value);
}

/** Removes leading and trailing whitespace; inner text and line breaks stay as typed. */
export function normalizeWishText(text: string): string {
  return text.trim();
}

/**
 * Pure draft check shared by the WishModal (client) and the create route (server, MFW-45).
 * Throws TypeError for a malformed draft (non-string text, unknown visibility); the caller validates types first.
 */
export function evaluateWishDraft(draft: WishDraft): WishDraftEvaluation {
  if (typeof draft.text !== "string") throw new TypeError("wish text must be a string");
  if (draft.visibility !== null && !isWishVisibility(draft.visibility)) throw new TypeError("unknown wish visibility");
  const text = normalizeWishText(draft.text);
  const found = new Set<WishDraftIssue>();
  let moderationReasons = NO_REASONS;
  if (text.length === 0) found.add("text_empty");
  else if (text.length > WISH_TEXT_MAX_LENGTH) found.add("text_too_long");
  if (draft.visibility === null) found.add("visibility_missing");
  // Owner decision 13: only the public text is moderated.
  if (draft.visibility === "public" && text.length > 0) {
    const guard = checkPublicWish(text);
    if (!guard.ok) {
      found.add("moderation_blocked");
      moderationReasons = guard.reasons;
    }
  }
  if (found.size === 0 && draft.visibility !== null) {
    return Object.freeze({ ok: true as const, wish: Object.freeze({ text, visibility: draft.visibility }) });
  }
  return Object.freeze({
    ok: false as const,
    issues: Object.freeze(WISH_DRAFT_ISSUES.filter((issue) => found.has(issue))),
    moderationReasons,
  });
}

/** Backlog 4.3 AC3: public text goes only to the public column, private text only to the private column. */
export function toWishColumns(wish: ComposedWish): WishColumns {
  switch (wish.visibility) {
    case "public":
      return Object.freeze({ publicWishText: wish.text, privateWishPlaintext: null });
    case "private":
      return Object.freeze({ publicWishText: null, privateWishPlaintext: wish.text });
    default: {
      const unreachable: never = wish.visibility;
      void unreachable;
      throw new TypeError("unknown wish visibility");
    }
  }
}

/** The wish part of the POST /api/creations body (MFW-23 builds the body, MFW-45 parses it). */
export function toWishRequestFields(wish: ComposedWish): WishRequestFields {
  return Object.freeze({ wishText: wish.text, wishVisibility: wish.visibility });
}

/** Reasons from an untrusted create-API error body, or null when it is not a moderation_blocked body. */
export function moderationReasonsFromServerBody(body: unknown): readonly ModerationReason[] | null {
  return parseModerationBlockedBody(body)?.reasons ?? null;
}
