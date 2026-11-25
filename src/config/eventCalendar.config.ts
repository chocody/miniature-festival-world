/** Every festival date in the roadmap is a Thailand date (MFW-53, AC 1). Thailand has no DST, so the offset is fixed. */
export const EVENT_TIME_ZONE = "Asia/Bangkok";
export const EVENT_UTC_OFFSET = "+07:00";
export const EVENT_UTC_OFFSET_MINUTES = 420;
export const MS_PER_MINUTE = 60_000;
/** Thai month abbreviations as written in docs/spec/01-roadmap.md ("24 พ.ย. 2026"), index 0 = January. */
export const THAI_MONTH_ABBREVIATIONS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;
/** En dash (U+2013), as in the roadmap ("20–26 ธ.ค. 2026", "31 ธ.ค. 2026 – 1 ม.ค. 2027"). */
export const DATE_RANGE_DASH = "–";
