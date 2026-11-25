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

/** Release time shown in the list: device-local time, Thai locale. Lead UI choice. */
export const MY_CREATIONS_TIME_LOCALE = "th-TH";
export const MY_CREATIONS_TIME_FORMAT: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Drawer copy. Spec gives only "ค้นหาของฉัน"; the rest is DRAFT Thai, PLACEHOLDER (MFW-30 Open question 5). */
export const MY_CREATIONS_COPY = Object.freeze({
  openButton: "ค้นหาของฉัน",
  title: "กระทงของฉัน",
  deviceOnly: "รายการนี้เก็บไว้ในเครื่องนี้เท่านั้น",
  empty: "ยังไม่มีกระทงที่ปล่อยจากเครื่องนี้",
  itemLabel: (ordinal: number, zoneId: number, releasedAt: string) =>
    `กระทงที่ ${ordinal} · คุ้งน้ำที่ ${zoneId} · ปล่อยเมื่อ ${releasedAt}`,
  close: "ปิด",
  searching: "กำลังค้นหากระทงของคุณ…",
  found: (zoneId: number) => `พบกระทงของคุณที่คุ้งน้ำที่ ${zoneId}`,
  notFound: "ไม่พบกระทงนี้บนสายน้ำแล้ว",
  failed: "ค้นหาไม่สำเร็จ ลองอีกครั้ง",
});
