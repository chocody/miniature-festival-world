/**
 * InspectPopup copy (spec §3 "ดูคำอวยพรคนอื่นแบบ Anonymous + ปุ่ม Report"). DRAFT Thai copy, PLACEHOLDER (spec silent; MFW-28 plan §11 Q1).
 * Owner decision 29 (MFW-63): an open wish shows its display name ("fromLabel" + name, DRAFT).
 */
export const INSPECT_POPUP_COPY = Object.freeze({
  dialogTitle: "กระทงในสายน้ำ",
  appearanceHeading: "รูปลักษณ์",
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
  unknownPart: "—",
  flowerListSeparator: " · ",
  flowerCountPrefix: "×",
});

/** A report request that takes longer than this counts as failed (the user can retry). Lead decision, MFW-28. */
export const REPORT_REQUEST_TIMEOUT_MS = 10_000;
