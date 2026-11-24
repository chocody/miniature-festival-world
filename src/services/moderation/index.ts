/** PII Detector (เบอร์โทร, อีเมล, Line ID) & Profanity Filter */
// Pure and isomorphic: used by the WishModal (client, MFW-21) and by the server write path (MFW-45, validateNewCreation).
export { normalizeForModeration } from "./normalize";
export { detectPii, isPhoneDigitRun } from "./piiDetector";
export { containsProfanity } from "./profanityFilter";
export {
  checkPublicWish,
  describeModerationReasons,
  isModerationReason,
  parseModerationBlockedBody,
  toModerationBlockedBody,
} from "./wishGuard";
export type { ModerationBlockedBody, ModerationWarning, WishGuardResult } from "./types";
export type { ModerationReason, PiiReason } from "@/config/moderation.config";
