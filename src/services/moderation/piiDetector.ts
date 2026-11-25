import {
  EMAIL_AT_WORDS_THAI, EMAIL_DOT_WORDS_THAI, EMAIL_OBFUSCATED_TLDS, HANDLE_MIN_LENGTH, HANDLE_TOKEN_CLASS,
  ID_KEYWORDS_LATIN, ID_KEYWORDS_THAI, LINE_KEYWORDS_LATIN, LINE_KEYWORDS_THAI, MODERATION_REASONS,
  PHONE_MAX_DIGITS, PHONE_SEPARATOR_MAX_CHARS, SOCIAL_KEYWORDS_LATIN, SOCIAL_KEYWORDS_THAI, SOCIAL_PROFILE_DOMAINS,
  THAI_PHONE_PATTERNS, type PiiReason,
} from "@/config/moderation.config";
import { alternation, normalizeForModeration } from "./normalize";

type PatternRule = { readonly kind: "pattern"; readonly reason: PiiReason; readonly pattern: RegExp };
type PhoneRule = { readonly kind: "phone" };
type PiiRule = PatternRule | PhoneRule;

/** Optional "@" + a handle of at least HANDLE_MIN_LENGTH token characters. */
const TOKEN = `@?${HANDLE_TOKEN_CLASS}{${HANDLE_MIN_LENGTH},}`;
/** Latin keywords must not be glued to other Latin letters ("deadline", "online" are not "line"). */
const LATIN_START = "(?<![a-z])";
const LATIN_END = "(?![a-z])";
const LINE_KW = `(?:${LATIN_START}(?:${alternation(LINE_KEYWORDS_LATIN)})|${alternation(LINE_KEYWORDS_THAI)})`;
const LINE_KW_THAI = `(?:${alternation(LINE_KEYWORDS_THAI)})`;
/** "id" right after "line" may be glued to it ("lineid"), but not followed by a letter ("line idea"). */
const ID_AFTER_LINE = `(?:(?:${alternation(ID_KEYWORDS_LATIN)})${LATIN_END}|${alternation(ID_KEYWORDS_THAI)})`;
const ID_KW = `(?:${LATIN_START}(?:${alternation(ID_KEYWORDS_LATIN)})|${alternation(ID_KEYWORDS_THAI)})`;
const LINE_AFTER_ID = `(?:(?:${alternation(LINE_KEYWORDS_LATIN)})${LATIN_END}|${alternation(LINE_KEYWORDS_THAI)})`;

/** Token that starts with a Latin letter (Thai-keyword rules: "ไอจี 10k followers" and "ไลน์ 100 คน" is not an id; "ไลน์ somchai99" is). */
const LETTER_TOKEN = `(?=@?[a-z])${TOKEN}`;
/** Bare English id after "line"/"ig is": at least 4 characters, a letter, and a digit or underscore ("somchai99"). */
const BARE_ID_MIN_LENGTH = 4;
const BARE_ID = `@?(?=${HANDLE_TOKEN_CLASS}*[a-z])(?=${HANDLE_TOKEN_CLASS}*[0-9_])${HANDLE_TOKEN_CLASS}{${BARE_ID_MIN_LENGTH},}`;
/** A run of whitespace is collapsed to one space before matching, so adjacent \s* cannot backtrack quadratically. */
const WHITESPACE_RUN = /\s+/g;

const rule = (reason: PiiReason, source: string): PatternRule => ({ kind: "pattern", reason, pattern: new RegExp(source, "g") });

const PII_RULES: readonly PiiRule[] = Object.freeze([
  // 1. e-mail. The lookbehind makes each local part start once, which keeps the scan linear.
  // Optional single spaces around "@" and "." ("john @ gmail.com", "john@gmail . com").
  rule("email", "(?<![a-z0-9._%+-])[a-z0-9._%+-]+ ?@ ?[a-z0-9-]+(?: ?\\. ?[a-z0-9-]+)+"),
  // 2. obfuscated e-mail: name [at]/(at)/at/แอท domain ./[dot]/(dot)/dot/ดอท tld
  rule(
    "email",
    `(?<![a-z0-9._%+-])[a-z0-9._%+-]+\\s*(?:\\[at\\]|\\(at\\)|${LATIN_START}at${LATIN_END}|${alternation(EMAIL_AT_WORDS_THAI)})` +
      `\\s*[a-z0-9-]+\\s*(?:\\.|\\[dot\\]|\\(dot\\)|${LATIN_START}dot${LATIN_END}|${alternation(EMAIL_DOT_WORDS_THAI)})` +
      `\\s*(?:${alternation(EMAIL_OBFUSCATED_TLDS)})${LATIN_END}`,
  ),
  // 3. profile links: facebook.com/…, https://www.instagram.com/…, tiktok.com/@…, line.me/ti/p/…
  rule("social_handle", `(?<![a-z0-9.-])(?:[a-z0-9-]+\\.)*(?:${alternation(SOCIAL_PROFILE_DOMAINS)})\\/\\S+`),
  // 4. phone numbers (function rule, see isPhoneDigitRun)
  { kind: "phone" },
  // 5. LINE: "line: x", "line id: x", "lineid = x", "ไลน์: x"
  rule("line_id", `${LINE_KW}(?:\\s*${ID_AFTER_LINE})?\\s*[:=]\\s*${TOKEN}`),
  // 6. LINE: "line id x", "ไลน์ไอดี x"
  rule("line_id", `${LINE_KW}\\s*${ID_AFTER_LINE}\\s*${TOKEN}`),
  // 7. LINE: "id line x", "ไอดีไลน์: x"
  rule("line_id", `${ID_KW}\\s*${LINE_AFTER_ID}(?:\\s*[:=])?\\s*${TOKEN}`),
  // 8. LINE: Thai keyword directly followed by a Latin id ("ไลน์ somchai99", "แอดไลน์ @abc123")
  rule("line_id", `${LINE_KW_THAI}\\s*${LETTER_TOKEN}`),
  // 9. social keyword (Latin) + ":" or "=" + handle ("ig: x", "fb = x")
  rule("social_handle", `${LATIN_START}(?:${alternation(SOCIAL_KEYWORDS_LATIN)})${LATIN_END}\\s*[:=]\\s*${TOKEN}`),
  // 10. social keyword (Thai) + optional ":"/"=" + Latin handle ("ไอจี somchai99", "เฟส: x")
  rule("social_handle", `(?:${alternation(SOCIAL_KEYWORDS_THAI)})(?:\\s*[:=])?\\s*${LETTER_TOKEN}`),
  // 10b. English "line somchai99", "add my line somchai_99", "line is somchai99"
  rule("line_id", `${LATIN_START}(?:${alternation(LINE_KEYWORDS_LATIN)})(?:\\s+is)?\\s+${BARE_ID}`),
  // 10c. "ig is somchai99", "my fb is somchai_99"
  rule("social_handle", `${LATIN_START}(?:${alternation(SOCIAL_KEYWORDS_LATIN)})${LATIN_END}\\s+is\\s+${BARE_ID}`),
  // 11. "@handle" with at least one letter ("@somchai_j"; not "@100", not "@ทุกคน")
  rule("social_handle", `@(?=${HANDLE_TOKEN_CLASS}*[a-z])${HANDLE_TOKEN_CLASS}{${HANDLE_MIN_LENGTH},}`),
]);

/** A digit run: digits separated by at most PHONE_SEPARATOR_MAX_CHARS of [whitespace - . ( )]. Commas and "/" end a run. */
const PHONE_RUN = new RegExp(`[0-9](?:[\\s\\-.()]{0,${PHONE_SEPARATOR_MAX_CHARS}}[0-9])*`, "g");
const NON_DIGITS = /[^0-9]+/;

/**
 * True when some contiguous sequence of the run's digit groups, concatenated, matches a THAI_PHONE_PATTERNS entry.
 * "2569 081 234 5678" → groups [2569, 081, 234, 5678] → "0812345678" matches. "24/11/2569" is three runs, none matches.
 */
export function isPhoneDigitRun(run: string): boolean {
  const groups = run.split(NON_DIGITS).filter((g) => g !== "");
  for (let i = 0; i < groups.length; i += 1) {
    let digits = "";
    for (let j = i; j < groups.length; j += 1) {
      digits += groups[j];
      if (digits.length > PHONE_MAX_DIGITS) break;
      if (THAI_PHONE_PATTERNS.some((p) => p.test(digits)) && isPhoneGrouping(groups.slice(i, j + 1))) return true;
    }
  }
  return false;
}

const COUNTRY_CODE_GROUP = "66";
const MIN_TAIL_GROUP_LENGTH = 3;

/**
 * Real phone formats only: single digits ("0 8 1 ..."), or a first group of any length followed by groups of at least
 * MIN_TAIL_GROUP_LENGTH digits ("081 234 5678", "02-123-4567", "0-2123-4567"); after a "66" group the first national group
 * may be short ("66 81 234 5678"). Dates ("08.11.2569") and times ("08.30 09.45") have 2-digit tail groups and are skipped.
 */
function isPhoneGrouping(groups: readonly string[]): boolean {
  if (groups.every((g) => g.length === 1)) return true;
  const national = groups.length > 1 && groups[0] === COUNTRY_CODE_GROUP ? groups.slice(1) : groups;
  return national.slice(1).every((g) => g.length >= MIN_TAIL_GROUP_LENGTH);
}

const blankOut = (match: string): string => " ".repeat(match.length);

/** PII categories found in `text` (unique, in MODERATION_REASONS order). Pure; never throws for a string input. */
export function detectPii(text: string): readonly PiiReason[] {
  let working = normalizeForModeration(text).replace(WHITESPACE_RUN, " ");
  const found = new Set<PiiReason>();
  for (const r of PII_RULES) {
    if (r.kind === "phone") {
      working = working.replace(PHONE_RUN, (run) => {
        if (!isPhoneDigitRun(run)) return run;
        found.add("phone");
        return blankOut(run);
      });
    } else {
      working = working.replace(r.pattern, (match) => {
        found.add(r.reason);
        return blankOut(match);
      });
    }
  }
  return MODERATION_REASONS.filter((reason): reason is PiiReason => reason !== "profanity" && found.has(reason));
}
