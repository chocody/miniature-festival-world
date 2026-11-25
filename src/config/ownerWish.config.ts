/**
 * Max bytes of a POST /api/private-wish body. A valid body ({ creationId: uuid, ownerToken: 43 chars }) is about 100 bytes.
 * Technical DoS bound, lead decision MFW-31.
 */
export const OWNER_WISH_REVEAL_REQUEST_MAX_BYTES = 512;
/** A reveal request slower than this counts as failed (the owner can retry). Same value as REPORT_REQUEST_TIMEOUT_MS; lead decision MFW-31. */
export const OWNER_WISH_REVEAL_TIMEOUT_MS = 10_000;
/** PrivateWishReveal copy. DRAFT Thai copy, PLACEHOLDER (spec silent; Open question 4). */
export const OWNER_WISH_COPY = Object.freeze({
  heading: "คำอธิษฐานส่วนตัวของฉัน",
  deviceOnlyNote: "เปิดอ่านได้เฉพาะบนอุปกรณ์ที่ปล่อยกระทงนี้",
  reveal: "อ่านคำอธิษฐานส่วนตัว",
  revealing: "กำลังเปิด…",
  hide: "ซ่อนข้อความ",
  none: "ไม่พบคำอธิษฐานส่วนตัวของกระทงนี้บนอุปกรณ์นี้",
  failed: "เปิดอ่านไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
});
/** Max bytes of a POST /api/wish-visibility body (a valid body is about 110 bytes). Technical DoS bound, lead decision MFW-62. */
export const WISH_VISIBILITY_REQUEST_MAX_BYTES = 512;
/** A switch request slower than this counts as failed (the owner can tap again). Same value as OWNER_WISH_REVEAL_TIMEOUT_MS; lead decision MFW-63. */
export const WISH_VISIBILITY_TIMEOUT_MS = 10_000;
/** 409 conflict = changed concurrently (MFW-62 review): resend the same request this many times; the server answers 200 when the end state already matches. Lead decision MFW-63. */
export const WISH_VISIBILITY_CONFLICT_RETRIES = 1;
/** Owner switch copy (My Creations + popup owner section). DRAFT Thai copy, PLACEHOLDER (spec silent). */
export const OWNER_SWITCH_COPY = Object.freeze({
  heading: "ใครเห็นคำอธิษฐานนี้",
  loading: "กำลังโหลดสถานะ…",
  loadFailed: "โหลดสถานะไม่สำเร็จ",
  retryLoad: "โหลดอีกครั้ง",
  saving: "กำลังบันทึก…",
  switchedOn: "เปิดให้ทุกคนเห็นแล้ว",
  switchedOff: "ปิดแล้ว คำอธิษฐานเป็นส่วนตัว",
  stayedPrivate: "คำอธิษฐานยังเป็นส่วนตัวอยู่",
  hidden: "คำอธิษฐานนี้ถูกซ่อนจากการรายงาน จึงเปิดให้ทุกคนเห็นอีกไม่ได้",
  notFound: "เปลี่ยนไม่ได้ ไม่พบกระทงนี้ของอุปกรณ์นี้แล้ว",
  failed: "เปลี่ยนไม่สำเร็จ ลองอีกครั้ง",
});
