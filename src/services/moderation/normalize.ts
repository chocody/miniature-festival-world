/** Soft hyphen, zero-width space/joiners, LRM/RLM, word joiner and invisible operators, BOM. */
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g;
const FULLWIDTH_FIRST = 0xff01; // "！"
const FULLWIDTH_LAST = 0xff5e; // "～"
const FULLWIDTH_TO_ASCII_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;
const DASH_FIRST = 0x2010; // hyphen .. horizontal bar
const DASH_LAST = 0x2015;
const MINUS_SIGN = 0x2212;
const THAI_DIGIT_ZERO = 0x0e50; // "๐"
const THAI_DIGIT_NINE = 0x0e59; // "๙"
const ASCII_DIGIT_ZERO = 0x30;

/**
 * Canonical form used by every moderation rule: invisible characters removed, full-width ASCII → ASCII,
 * ideographic space → " ", Thai digits → ASCII digits, then lowercase. Deliberately NOT NFKC: NFKC splits
 * Thai SARA AM (ำ) into two code points, which would break Thai word matching (D2). Pure; length may shrink.
 */
export function normalizeForModeration(text: string): string {
  let out = "";
  for (const ch of text.replace(INVISIBLE_CHARS, "")) {
    const code = ch.codePointAt(0) as number;
    if (code >= FULLWIDTH_FIRST && code <= FULLWIDTH_LAST) out += String.fromCodePoint(code - FULLWIDTH_TO_ASCII_OFFSET);
    else if (code === IDEOGRAPHIC_SPACE) out += " ";
    else if ((code >= DASH_FIRST && code <= DASH_LAST) || code === MINUS_SIGN) out += "-";
    else if (code >= THAI_DIGIT_ZERO && code <= THAI_DIGIT_NINE) {
      out += String.fromCodePoint(code - THAI_DIGIT_ZERO + ASCII_DIGIT_ZERO);
    } else out += ch;
  }
  return out.toLowerCase();
}

/** Escapes a literal for use inside a RegExp source. */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "a|b|c" of escaped literals, longest first (ties: code-unit order), so a longer keyword wins over its prefix. */
export function alternation(literals: readonly string[]): string {
  return [...literals]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegExp)
    .join("|");
}
