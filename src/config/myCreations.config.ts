/** Keys of one stored device-list entry, in this order (MFW-30). Exactly these keys; anything else is rejected on read. */
export const MY_CREATION_ENTRY_KEYS = Object.freeze(["id", "eventId", "zoneId", "createdAt", "expiresAt"] as const);
export type MyCreationEntryKey = (typeof MY_CREATION_ENTRY_KEYS)[number];

/** Lowercase uuid, same as UUID_PATTERN in database.config.ts (checked by myCreations.config.test.ts; not imported to keep server config off the client). */
export const MY_CREATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Most entries kept per device; the oldest are dropped first. PLACEHOLDER (spec silent; MFW-30 Open question 3).
 * Bounds storage use while POST /api/creations has no per-device cap (docs/follow-ups.md, MFW-45).
 */
export const MY_CREATIONS_MAX_ENTRIES = 50;

/**
 * Picker date (owner decision 2026-11-26): English "26 NOV 2026" plus a 24-hour "21:05", device-local. The month table is
 * explicit so the text never depends on the runtime's Intl data.
 */
export const MY_CREATIONS_MONTHS: readonly string[] = Object.freeze([
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
]);

/** Picker copy. `openButton` is the Find My button's aria-label, `title` the list's aria-label; the rest is screen-reader status. DRAFT Thai (MFW-30 Open question 5). */
export const MY_CREATIONS_COPY = Object.freeze({
  openButton: "ค้นหาของฉัน",
  title: "กระทงของฉัน",
  searching: "กำลังค้นหากระทงของคุณ…",
  found: (zoneId: number) => `พบกระทงของคุณที่คุ้งน้ำที่ ${zoneId}`,
  notFound: "ไม่พบกระทงนี้บนสายน้ำแล้ว",
  failed: "ค้นหาไม่สำเร็จ ลองอีกครั้ง",
});
