import type { FestivalEventConfig } from "./types";

export const newYearConfig = {
  id: "new_year",
  name: "New Year",
  nameTh: "ปีใหม่ 2027",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — DRAFT: §1.1.3; the §1 table says 31 Dec – 1 Jan. */
  dateWindows: [
    { startsAt: "2026-12-28T00:00:00+07:00", endsAt: "2027-01-06T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
