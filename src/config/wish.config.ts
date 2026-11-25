// MFW-21 (backlog 4.3): wish composer contract, limit and Thai copy.

/** "เก็บข้อความเป็นส่วนตัว" vs "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)" (spec §6.4 Task 4.3). Same values as backlog 2.4 `wishVisibility`. */
export const WISH_VISIBILITIES = Object.freeze(["private", "public"] as const);
export type WishVisibility = (typeof WISH_VISIBILITIES)[number];

/** Why a draft cannot be submitted yet. Order = display order (text field first, then the choice). */
export const WISH_DRAFT_ISSUES = Object.freeze([
  "text_empty",
  "text_too_long",
  "visibility_missing",
  "moderation_blocked",
] as const);
export type WishDraftIssue = (typeof WISH_DRAFT_ISSUES)[number];

/**
 * Max wish length in UTF-16 code units (String.length — the same unit as the textarea maxLength), measured after trimming.
 * One limit for both visibilities. PLACEHOLDER (spec silent) — Open question 1.
 */
export const WISH_TEXT_MAX_LENGTH = 280;
/** Visible textarea rows. Lead decision (layout only). */
export const WISH_TEXTAREA_ROWS = 4;

/** How an open wish without a name is shown (owner decision 36). Spec word. */
export const DISPLAY_NAME_FALLBACK = "ไม่ระบุชื่อ";

/** Composer issues, in display order (name field first, then the wish). MFW-63. */
export const WISH_COMPOSER_ISSUES = Object.freeze([
  "name_too_long",
  "name_invalid",
  "name_blocked",
  "text_empty",
  "text_too_long",
  "wish_blocked",
] as const);
export type WishComposerIssue = (typeof WISH_COMPOSER_ISSUES)[number];

/** The single visibility switch (owner decisions 29 and 36). Label = AC words; helper = DRAFT copy, PLACEHOLDER (owner may edit). */
export const WISH_SWITCH_COPY = Object.freeze({
  label: "เปิดให้ทุกคนเห็น",
  helper:
    "เมื่อเปิด ทุกคนจะเห็นชื่อและคำอธิษฐานนี้ เมื่อปิด คำอธิษฐานจะเป็นส่วนตัว อ่านได้เฉพาะคุณจากอุปกรณ์นี้ เปลี่ยนได้ภายหลังที่ “ค้นหาของฉัน”",
});

/** Thai UI copy. MFW-63: name + switch; DRAFT copy, PLACEHOLDER (owner may edit). */
export const WISH_COPY = Object.freeze({
  title: "เขียนคำอธิษฐาน",
  textLabel: "คำอธิษฐานหรือสิ่งที่อยากปล่อยวาง",
  textPlaceholder: "เขียนสิ่งที่อยากขอ หรือสิ่งที่อยากปล่อยไปกับสายน้ำ",
  nameLabel: "ชื่อที่จะแสดง (ไม่ใส่ก็ได้)",
  namePlaceholder: "เช่น ชื่อเล่น",
  nameHint: `ถ้าไม่ใส่ จะแสดงเป็น “${DISPLAY_NAME_FALLBACK}” และชื่อจะแสดงเฉพาะเมื่อเปิดให้ทุกคนเห็น`,
  /** Status line for the first non-moderation issue (the moderation warning has its own copy in MODERATION_COPY). */
  issues: Object.freeze({
    name_too_long: "ชื่อยาวเกินกำหนด",
    name_invalid: "ชื่อมีอักขระที่ใช้ไม่ได้",
    text_empty: "เขียนคำอธิษฐานก่อน",
    text_too_long: "ข้อความยาวเกินกำหนด",
  }) satisfies Readonly<Record<Exclude<WishComposerIssue, "name_blocked" | "wish_blocked">, string>>,
  /** Same label as the other flow steps; e2e and FlowRoot tests click it by this name. */
  submit: "ถัดไป",
});

/**
 * Max display-name length in UTF-16 code units (String.length), measured after trimming (open question 36:
 * "Length limit: config placeholder"). PLACEHOLDER — owner to confirm (MFW-62 Open question 1).
 * Lowering it later makes an already stored longer private name fail to open (503, fail closed).
 */
export const DISPLAY_NAME_MAX_LENGTH = 40;
/** A display name may not contain control characters (line breaks, tabs, NUL …). Lead decision MFW-62 (technical input hygiene). */
export const DISPLAY_NAME_FORBIDDEN_PATTERN = /\p{Cc}/u;
