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

/** Server-only env var names (never NEXT_PUBLIC). Key = standard base64 of 32 random bytes ("openssl rand -base64 32"). */
export const PRIVATE_WISH_KEY_ENV = "PRIVATE_WISH_KEY";
/** Key id stored next to every ciphertext (owner decision 2); must match PRIVATE_WISH_KEY_ID_PATTERN. */
export const PRIVATE_WISH_KEY_ID_ENV = "PRIVATE_WISH_KEY_ID";
/** AES-256 key length. */
export const AES_256_KEY_BYTES = 32;
/** GCM tag length in bits (= AES_GCM_TAG_BYTES × 8). */
export const AES_GCM_TAG_LENGTH_BITS = 128;
/** Standard base64 (with padding) of exactly 32 bytes. */
export const PRIVATE_WISH_KEY_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
/** Additional authenticated data = "<label>|<version>|<keyId>|<owner hash>": binds a ciphertext to its key id and owner. */
export const PRIVATE_WISH_AAD_LABEL = "mfw:private-wish";
export const PRIVATE_WISH_AAD_SEPARATOR = "|";
/**
 * Key id of the per-process random key used ONLY with the in-memory backend when no key env is set (CI, previews).
 * In-memory rows die with the process, and so does this key. Reserved: the env key id may not use it.
 */
export const PRIVATE_WISH_EPHEMERAL_KEY_ID = "ephemeral";

/**
 * Server-only env var (never NEXT_PUBLIC) listing RETIRED keys that may still decrypt (owner decision 2: rotation).
 * Format: "<keyId>:<base64 key>[,<keyId>:<base64 key>…]" — each id matches PRIVATE_WISH_KEY_ID_PATTERN, is not the ephemeral id and differs from the
 * current PRIVATE_WISH_KEY_ID; each key is standard base64 of 32 bytes. Empty / unset = no retired keys. Retired keys never encrypt.
 */
export const PRIVATE_WISH_RETIRED_KEYS_ENV = "PRIVATE_WISH_RETIRED_KEYS";
export const PRIVATE_WISH_RETIRED_KEYS_SEPARATOR = ",";
export const PRIVATE_WISH_RETIRED_KEY_ID_SEPARATOR = ":";
/** Technical bound on the retired list (each entry is one key import per process). Lead decision MFW-31. */
export const PRIVATE_WISH_RETIRED_KEYS_MAX = 8;
