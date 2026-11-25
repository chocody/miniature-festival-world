import type { FestivalEventConfig } from "./types";

export const midAutumnConfig = {
  id: "mid_autumn",
  name: "Mid-Autumn",
  nameTh: "ไหว้พระจันทร์",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — docs/spec/01-roadmap.md §1.1.7 (same as the §1 table). */
  dateWindows: [
    { startsAt: "2027-09-15T00:00:00+07:00", endsAt: "2027-09-16T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
