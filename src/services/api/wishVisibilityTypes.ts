// MFW-62 (backlog 12.1): client-safe contract of the wish visibility switch. Types and constants only.
import type { ModerationBlockedBody } from "@/services/moderation";

/** POST endpoint of the wish visibility switch (MFW-62). The token goes only in the JSON body (open question 1). */
export const WISH_VISIBILITY_PATH = "/api/wish-visibility";
/** Request body: exactly these keys (any order). Content-Type application/json; the URL must have no query string. */
export const WISH_VISIBILITY_BODY_KEYS = Object.freeze(["creationId", "ownerToken", "open"] as const);

export interface WishVisibilityRequestBody {
  readonly creationId: string; // lowercase uuid
  readonly ownerToken: string; // raw DeviceOwnerToken; body only
  readonly open: boolean; // true = switch on (everyone sees name + wish), false = private
}

/** 200: the state after the request (idempotent: asking for the current state writes nothing). */
export interface WishVisibilityResponseBody {
  readonly open: boolean;
}

export type WishVisibilityErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "unexpected_query" } // 400
  | { readonly error: "invalid_body" } // 400
  | { readonly error: "not_found" } // 404, byte-identical for unknown, expired, not-yours, nothing to switch
  | { readonly error: "hidden" } // 409, owner only: hidden by reports/moderation, cannot be opened
  | { readonly error: "conflict" } // 409, owner only: changed concurrently; retry
  | ModerationBlockedBody // 422, owner only: wish and/or name blocked; nothing written
  | { readonly error: "unavailable" }; // 503
