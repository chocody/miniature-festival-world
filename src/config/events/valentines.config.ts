import type { FestivalEventConfig } from "./types";

export const valentinesConfig = {
  id: "valentines",
  name: "Valentine’s Day",
  nameTh: "วาเลนไทน์",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — DRAFT: §1.1.5; the §1 table says 14 Feb. */
  dateWindows: [
    { startsAt: "2027-02-12T00:00:00+07:00", endsAt: "2027-02-16T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
