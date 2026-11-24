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

export interface WishVisibilityOptionCopy {
  readonly label: string;
  readonly description: string;
}

/** Thai UI copy. Labels of the two options are the spec words; everything else is DRAFT copy (Open question 4). */
export const WISH_COPY = Object.freeze({
  title: "เขียนคำอธิษฐาน",
  textLabel: "คำอธิษฐานหรือสิ่งที่อยากปล่อยวาง",
  textPlaceholder: "เขียนสิ่งที่อยากขอ หรือสิ่งที่อยากปล่อยไปกับสายน้ำ",
  visibilityLegend: "จะให้ข้อความนี้เป็นแบบไหน",
  options: Object.freeze({
    private: Object.freeze({
      label: "เก็บข้อความเป็นส่วนตัว",
      description: "ไม่แสดงให้คนอื่นเห็น อ่านได้เฉพาะคุณจากอุปกรณ์นี้",
    }),
    public: Object.freeze({
      label: "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)",
      description: "ทุกคนอ่านได้ โดยไม่แสดงชื่อหรือโปรไฟล์ของคุณ",
    }),
  }) satisfies Readonly<Record<WishVisibility, WishVisibilityOptionCopy>>,
  /** Status line for the first non-moderation issue (the moderation warning has its own copy in MODERATION_COPY). */
  issues: Object.freeze({
    text_empty: "เขียนคำอธิษฐานก่อน",
    text_too_long: "ข้อความยาวเกินกำหนด",
    visibility_missing: "เลือกก่อนว่าจะเก็บเป็นส่วนตัวหรือเผยแพร่แบบไม่ระบุตัวตน",
  }) satisfies Readonly<Record<Exclude<WishDraftIssue, "moderation_blocked">, string>>,
  /** Same label as the other flow steps; e2e and FlowRoot tests click it by this name. */
  submit: "ถัดไป",
});
