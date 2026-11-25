/** spec §5 moderation_status enum; order equals the SQL enum public.moderation_status. */
export const MODERATION_STATUSES = Object.freeze(["approved", "flagged", "hidden"] as const);
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
/** New rows are visible; the server-side guard (2.3, run by the 2.4 route) happens before the insert. Lead decision, MFW-12 (D12). */
export const DEFAULT_MODERATION_STATUS: ModerationStatus = "approved";
/** An item is auto-hidden when report_count reaches this value (owner, 2026-11-23, open question 3). Mirrored in the SQL view. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

// ---------------------------------------------------------------------------------------------------------------
// MFW-13 (backlog 2.3): PII guard and profanity filter rules. "กฎการกรอง PII และคำต้องห้าม" (spec §3).
// All text is matched after normalizeForModeration (lowercase, full-width → ASCII, Thai digits → ASCII digits,
// invisible characters removed), so every Latin literal below must be lowercase.
// ---------------------------------------------------------------------------------------------------------------

/** Why a public wish is blocked. The order is the order reasons are reported in. */
export const MODERATION_REASONS = Object.freeze(["phone", "email", "line_id", "social_handle", "profanity"] as const);
export type ModerationReason = (typeof MODERATION_REASONS)[number];
export type PiiReason = Exclude<ModerationReason, "profanity">;

/** Status set when report_count reaches AUTO_HIDE_REPORT_THRESHOLD (auto-hidden, awaiting review). Lead decision, MFW-13 (D11). */
export const AUTO_HIDE_MODERATION_STATUS: ModerationStatus = "flagged";

/** Max bytes of a POST /api/reports body. A valid body is 53 bytes. Lead decision, MFW-13 (D9). */
export const REPORT_REQUEST_MAX_BYTES = 1_024;

/** Min characters of an id/handle after a LINE/social keyword or "@". Lead heuristic, MFW-13 (D5). */
export const HANDLE_MIN_LENGTH = 3;
/** Regex character class of a LINE ID / social handle (LINE: a-z 0-9 . - _; IG/TikTok/X: a-z 0-9 . _). */
export const HANDLE_TOKEN_CLASS = "[a-z0-9._-]";

/** "line" (Latin keyword, matched only when not preceded by a Latin letter). */
export const LINE_KEYWORDS_LATIN = Object.freeze(["line"]);
export const LINE_KEYWORDS_THAI = Object.freeze(["ไลน์", "ไลน"]);
export const ID_KEYWORDS_LATIN = Object.freeze(["id"]);
export const ID_KEYWORDS_THAI = Object.freeze(["ไอดี"]);

/** Social network names that, followed by ":" or "=", introduce a handle (Latin) or, followed by a handle, introduce one (Thai). */
export const SOCIAL_KEYWORDS_LATIN = Object.freeze([
  "instagram", "insta", "ig", "facebook", "fb", "tiktok", "twitter", "youtube", "threads",
]);
export const SOCIAL_KEYWORDS_THAI = Object.freeze([
  "อินสตาแกรม", "อินสตา", "ไอจี", "เฟสบุ๊ค", "เฟสบุ๊ก", "เฟซบุ๊ก", "เฟซบุ๊ค", "เฟส", "เฟซ", "ติ๊กต็อก", "ติ๊กต๊อก", "ทวิตเตอร์", "ยูทูบ",
]);
/** Profile-link hosts: "<domain>/<anything>" (any subdomain, with or without https://) is a social handle. */
export const SOCIAL_PROFILE_DOMAINS = Object.freeze([
  "facebook.com", "fb.com", "fb.me", "instagram.com", "instagr.am", "tiktok.com", "twitter.com", "x.com",
  "threads.net", "youtube.com", "youtu.be", "line.me", "lin.ee",
]);

/** Obfuscated e-mail: "name [at] gmail [dot] com", "name แอท gmail ดอท com", "name at gmail dot com". */
export const EMAIL_AT_WORDS_THAI = Object.freeze(["แอท"]);
export const EMAIL_DOT_WORDS_THAI = Object.freeze(["ดอท"]);
export const EMAIL_OBFUSCATED_TLDS = Object.freeze(["com", "net", "org", "co", "me", "io", "ac", "go", "in"]);

/**
 * Thai numbering plan (NBTC): mobile = 0 + [6|8|9] + 8 digits (10); fixed line = 0 + [2-5|7] + 7 digits (9);
 * international form = 66 + the national number without its leading 0. Matched against the digits of a digit run.
 */
export const THAI_PHONE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^0[689][0-9]{8}$/,
  /^0[2-57][0-9]{7}$/,
  /^66[689][0-9]{8}$/,
  /^66[2-57][0-9]{7}$/,
]);
/** Longest digit string THAI_PHONE_PATTERNS can match (66 + 9). */
export const PHONE_MAX_DIGITS = 11;
/** Up to this many of [space - . ( )] may separate digit groups of one phone number ("081 - 234 - 5678"). */
export const PHONE_SEPARATOR_MAX_CHARS = 3;

/**
 * Thai banned words, matched as substrings of the "compact" text (whitespace and - _ . * ~ ' " ` removed),
 * because Thai has no spaces between words. PLACEHOLDER starter list (owner to review — Open question 2).
 */
export const PROFANITY_TH = Object.freeze([
  "เหี้ย", "ควย", "เย็ด", "ฉิบหาย", "ชิบหาย", "จัญไร", "ระยำ", "ส้นตีน", "อีดอก", "ไอ้สัตว์", "อีสัตว์", "สัส", "แตด", "หน้าหี", "เงี่ยน",
]);
/** Innocent words that contain a banned substring; removed before matching (เกลี้ยงเหี้ยน, แควยาว/แควใหญ่, สัสดี). */
export const PROFANITY_TH_ALLOWLIST = Object.freeze(["เหี้ยน", "แควย", "สัสดี"]);

/** word = whole Latin word; prefix = word starts with term; contains = anywhere inside a Latin word. */
export type ProfanityMatch = "word" | "prefix" | "contains";
export interface LatinProfanityTerm {
  readonly term: string; // lowercase a-z only
  readonly match: ProfanityMatch;
}
/** English banned words. PLACEHOLDER starter list (owner to review — Open question 2). */
export const PROFANITY_EN: readonly LatinProfanityTerm[] = Object.freeze([
  { term: "fuck", match: "contains" },
  { term: "shit", match: "prefix" },
  { term: "bitch", match: "prefix" },
  { term: "cunt", match: "prefix" },
  { term: "asshole", match: "prefix" },
  { term: "bastard", match: "prefix" },
  { term: "whore", match: "prefix" },
  { term: "slut", match: "prefix" },
  { term: "wanker", match: "prefix" },
  { term: "dick", match: "word" },
  { term: "dickhead", match: "word" },
  { term: "pussy", match: "word" },
  { term: "twat", match: "word" },
]);
/** Leetspeak folding applied ONLY for the English profanity pass ("sh1t" → "shit"). */
export const PROFANITY_LEET_MAP: Readonly<Record<string, string>> = Object.freeze({
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i",
});

/** Thai UI copy for the WishModal (MFW-21). DRAFT copy by the lead (owner may edit — Open question 2). */
export interface ModerationCopy {
  /** Standing note next to the "publish anonymously" choice (spec §6.2: แจ้งเตือนผู้ใช้ไม่ให้ใส่ข้อมูลส่วนบุคคล). */
  readonly publicHint: string;
  readonly blockedTitle: string;
  readonly fixHint: string;
  readonly reasons: Readonly<Record<ModerationReason, string>>;
}
export const MODERATION_COPY: ModerationCopy = Object.freeze({
  publicHint:
    "คำอธิษฐานแบบสาธารณะจะแสดงให้ทุกคนเห็น กรุณาอย่าใส่ข้อมูลส่วนบุคคล เช่น เบอร์โทรศัพท์ อีเมล ไลน์ไอดี หรือชื่อบัญชีโซเชียล",
  blockedTitle: "ยังเผยแพร่ข้อความนี้แบบสาธารณะไม่ได้",
  fixHint: "กรุณาลบข้อมูลส่วนนี้ออกก่อนเผยแพร่",
  reasons: Object.freeze({
    phone: "มีเบอร์โทรศัพท์อยู่ในข้อความ",
    email: "มีอีเมลอยู่ในข้อความ",
    line_id: "มีไลน์ไอดีอยู่ในข้อความ",
    social_handle: "มีชื่อบัญชีหรือลิงก์โซเชียลอยู่ในข้อความ",
    profanity: "มีคำไม่เหมาะสมอยู่ในข้อความ",
  }),
});
