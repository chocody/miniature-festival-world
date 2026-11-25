// MFW-63 (backlog 12.2): the wish step's composer = optional name + wish + one visibility switch.
// Pure and isomorphic: no React, store, fetch, storage, clock or auth. The server create path keeps using
// evaluateWishDraft / evaluateDisplayName directly; this module only combines them for the client.
import { WISH_COMPOSER_ISSUES, type WishComposerIssue, type WishVisibility } from "@/config/wish.config";
import type { ModerationReason } from "@/services/moderation";
import { evaluateDisplayName } from "./displayName";
import { evaluateWishDraft, type ComposedWish } from "./wishPayload";

export interface WishComposerDraft {
  readonly text: string;
  readonly open: boolean; // the switch: true = "public", false = "private"
  readonly displayName: string | null; // as typed; null/"" = no name
}

export type WishComposerEvaluation =
  | { readonly ok: true; readonly wish: ComposedWish; readonly displayName: string | null }
  | {
      readonly ok: false;
      readonly issues: readonly WishComposerIssue[]; // non-empty, unique, WISH_COMPOSER_ISSUES order
      readonly wishModerationReasons: readonly ModerationReason[]; // non-empty only with "wish_blocked"
      readonly nameModerationReasons: readonly ModerationReason[]; // non-empty only with "name_blocked"
    };

const NO_REASONS: readonly ModerationReason[] = Object.freeze([]);

/** true → "public", false → "private" (owner decision 29: the switch replaces the two-option choice). */
export function wishVisibilityOf(open: boolean): WishVisibility {
  return open ? "public" : "private";
}

/**
 * The name is moderated regardless of the switch (the server rejects such a create too, MFW-62).
 * Throws TypeError (never with the value) for a malformed draft.
 */
export function evaluateWishComposer(draft: WishComposerDraft): WishComposerEvaluation {
  if (typeof draft.open !== "boolean") throw new TypeError("open must be a boolean");
  const w = evaluateWishDraft({ text: draft.text, visibility: wishVisibilityOf(draft.open) });
  const n = evaluateDisplayName(draft.displayName);
  if (w.ok && n.ok) {
    return Object.freeze({ ok: true as const, wish: w.wish, displayName: n.name });
  }
  const found = new Set<WishComposerIssue>();
  let wishModerationReasons = NO_REASONS;
  let nameModerationReasons = NO_REASONS;
  if (!w.ok) {
    for (const issue of w.issues) {
      switch (issue) {
        case "text_empty":
        case "text_too_long":
          found.add(issue);
          break;
        case "moderation_blocked":
          found.add("wish_blocked");
          wishModerationReasons = Object.freeze([...w.moderationReasons]);
          break;
        default:
          // "visibility_missing" cannot happen: the visibility always comes from the boolean switch.
          throw new TypeError("unexpected wish draft issue");
      }
    }
  }
  if (!n.ok) {
    if (n.issue === "moderation_blocked") {
      found.add("name_blocked");
      nameModerationReasons = Object.freeze([...n.moderationReasons]);
    } else {
      found.add(n.issue);
    }
  }
  return Object.freeze({
    ok: false as const,
    issues: Object.freeze(WISH_COMPOSER_ISSUES.filter((issue) => found.has(issue))),
    wishModerationReasons,
    nameModerationReasons,
  });
}
