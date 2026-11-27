/**
 * InspectPopup copy (spec §3 "ดูคำอวยพรคนอื่นแบบ Anonymous + ปุ่ม Report"). DRAFT Thai copy, PLACEHOLDER (spec silent; MFW-28 plan §11 Q1).
 * Owner decision 29 (MFW-63): an open wish shows its display name ("fromLabel" + name, DRAFT).
 */
export const INSPECT_POPUP_COPY = Object.freeze({
  dialogTitle: "กระทงในสายน้ำ",
  wishHeading: "คำอธิษฐาน",
  fromLabel: "จาก",
  close: "ปิด",
  report: "รายงาน",
  reportPrompt: "รายงานคำอธิษฐานนี้ว่าไม่เหมาะสมใช่ไหม",
  reportConfirm: "ยืนยันรายงาน",
  reportCancel: "ยกเลิก",
  reportSending: "กำลังส่งรายงาน…",
  reportReceived: "ได้รับรายงานแล้ว ขอบคุณที่แจ้งให้ทราบ",
  reportFailed: "ส่งรายงานไม่สำเร็จ",
  reportRetry: "ลองอีกครั้ง",
});

/** A report request that takes longer than this counts as failed (the user can retry). Lead decision, MFW-28. */
export const REPORT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Wish bubble over another person's krathong (MFW-80, owner request 2026-11-26). DRAFT: AC1 says "a few seconds"; the owner confirms
 * the numbers (docs/follow-ups.md).
 */
export const WISH_BUBBLE_TIMING = Object.freeze({
  /** How long the bubble stays fully visible after a tap. DRAFT. */
  visibleMs: 5_000,
  /** Length of the fade-out that follows (ignored under reduced motion: the bubble just goes). DRAFT. */
  fadeMs: 600,
});

/** World units from the lane position up to the bubble's tail (lead layout value, DRAFT; tuned on the screenshots). */
export const WISH_BUBBLE_LIFT_WORLD = 0.6;

/** Technical: a screen move smaller than this does not rewrite the bubble's transform. */
export const WISH_BUBBLE_MIN_MOVE_PX = 0.5;

/** The bubble's aria-label (DRAFT Thai copy). */
export const WISH_BUBBLE_COPY = Object.freeze({ label: "คำอธิษฐาน" });

/** Technical: the bubble's text is inserted into its live region this long after mount, so a screen reader announces it (the anchor shows the bubble on the next frame). */
export const WISH_BUBBLE_ANNOUNCE_DELAY_MS = 100;
