import type { ModerationReason } from "@/config/moderation.config";

/** Result of checkPublicWish. `reasons` is non-empty, unique, in MODERATION_REASONS order. */
export type WishGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly ModerationReason[] };

/** What the WishModal (MFW-21) shows when a public wish is blocked. */
export interface ModerationWarning {
  readonly title: string;
  readonly messages: readonly string[]; // one per reason, same order
  readonly hint: string;
}

/** Error body for a public wish rejected by the server (MFW-45 POST /api/creations). Never contains the text. */
export interface ModerationBlockedBody {
  readonly error: "moderation_blocked";
  readonly reasons: readonly ModerationReason[];
}
