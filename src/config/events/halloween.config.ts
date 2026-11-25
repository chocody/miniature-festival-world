import type { FestivalEventConfig } from "./types";

export const halloweenConfig = {
  id: "halloween",
  name: "Halloween",
  nameTh: "ฮาโลวีน",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — docs/spec/01-roadmap.md §1.1.8 (same as the §1 table). */
  dateWindows: [
    { startsAt: "2027-10-31T00:00:00+07:00", endsAt: "2027-11-01T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
