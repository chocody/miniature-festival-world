/** InspectPopup copy (spec §3 "ดูคำอวยพรคนอื่นแบบ Anonymous + ปุ่ม Report"). DRAFT Thai copy, PLACEHOLDER (spec silent; MFW-28 plan §11 Q1). */
export const INSPECT_POPUP_COPY = Object.freeze({
  dialogTitle: "กระทงในสายน้ำ",
  anonymousNote: "ไม่ระบุชื่อผู้ปล่อย",
  appearanceHeading: "รูปลักษณ์",
  wishHeading: "คำอธิษฐาน",
  noPublicWish: "ไม่มีคำอธิษฐานสาธารณะ",
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
