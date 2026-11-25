import type { FestivalEventConfig } from "./types";

export const chineseNewYearConfig = {
  id: "chinese_new_year",
  name: "Chinese New Year",
  nameTh: "ตรุษจีนปีมะแม",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — DRAFT: §1.1.4; the §1 table says 5–6 Feb. */
  dateWindows: [
    { startsAt: "2027-02-04T00:00:00+07:00", endsAt: "2027-02-07T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
