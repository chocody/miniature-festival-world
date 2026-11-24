/**
 * Storage contract of the encrypted private wish column (owner decision 2: AES-256-GCM, key id per row).
 * Envelope: "v1.<base64url(IV)>.<base64url(ciphertext || GCM tag)>", base64url without padding.
 * MFW-45 (2.4) produces it; this card only stores and validates it.
 */
export const PRIVATE_WISH_ENVELOPE_VERSION = "v1";
export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
/** 12-byte IV → 16 chars; ciphertext+tag ≥ 16 bytes → ≥ 22 chars. Same regex text is in the SQL check constraint. */
export const PRIVATE_WISH_CIPHERTEXT_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
/** Key id stored next to each ciphertext (lowercase, 1–32 chars). Same regex text is in the SQL check constraint. */
export const PRIVATE_WISH_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
