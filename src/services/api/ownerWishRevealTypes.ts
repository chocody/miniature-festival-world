/** POST endpoint of the owner proof + private wish read (backlog 7.2). The token goes only in the JSON body (open question 1). */
export const OWNER_WISH_REVEAL_PATH = "/api/private-wish";
/** Request body: exactly these keys (any order). Content-Type must be application/json; the URL must have no query string. */
export const OWNER_WISH_REVEAL_BODY_KEYS = Object.freeze(["creationId", "ownerToken"] as const);

export interface OwnerWishRevealRequestBody {
  readonly creationId: string; // lowercase uuid, as returned by GET /api/creations
  readonly ownerToken: string; // the raw DeviceOwnerToken; body only, never a URL
}

/**
 * 200 body for EVERY well-formed request: the decrypted private wish only when the token proves ownership and the creation has one,
 * else null — byte-identical for unknown, expired, not-yours, public-wish and undecryptable creations (no existence / ownership oracle).
 */
export interface OwnerWishRevealResponseBody {
  readonly wishText: string | null;
}

export type OwnerWishRevealErrorBody =
  | { readonly error: "unsupported_media_type" } // 415
  | { readonly error: "payload_too_large" } // 413
  | { readonly error: "unexpected_query" } // 400: any query string (a token must never be in a URL)
  | { readonly error: "invalid_body" } // 400
  | { readonly error: "unavailable" }; // 503: backend / key configuration, never row-dependent
