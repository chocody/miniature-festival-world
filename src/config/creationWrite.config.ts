/**
 * Max bytes of a POST /api/creations body (UTF-8). A valid body without a wish is about 450 bytes; a wish of
 * WISH_TEXT_MAX_LENGTH (MFW-21) adds at most 6 bytes per UTF-16 unit when JSON-escaped. Technical DoS bound, lead decision
 * MFW-45. It is NOT the product wish-length limit (that is WISH_TEXT_MAX_LENGTH in wish.config.ts); creationWrite.config.test.ts
 * fails if a raised wish limit no longer fits.
 */
export const CREATE_CREATION_REQUEST_MAX_BYTES = 4_096;
/** Compare-and-insert attempts when a concurrent release changed the zone (owner decision 25). Lead decision MFW-45. */
export const CREATE_CREATION_MAX_ATTEMPTS = 3;
