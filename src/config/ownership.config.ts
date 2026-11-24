/**
 * DeviceOwnerToken settings (spec §6.2 Task 2.1, open question 1).
 * Token = DEVICE_OWNER_TOKEN_BYTES random bytes, base64url without padding.
 */

/** 32 bytes = 256 bits of entropy from crypto.getRandomValues. */
export const DEVICE_OWNER_TOKEN_BYTES = 32;

/** base64url (no padding) length of DEVICE_OWNER_TOKEN_BYTES bytes: ceil(32 * 8 / 6) = 43. */
export const DEVICE_OWNER_TOKEN_LENGTH = 43;

/**
 * Canonical base64url of exactly 32 bytes: 42 free chars + a last char whose 2 low bits are 0.
 * Hex (the hash format) can never match, because the token is 43 chars long, not 64.
 */
export const DEVICE_OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** LocalStorage key of the raw token. Versioned so a future format change can migrate. */
export const DEVICE_OWNER_TOKEN_STORAGE_KEY = "mfw:deviceOwnerToken:v1";

/** SHA-256 digest as lowercase hex (what the server stores as owner_token_hash). */
export const OWNER_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
