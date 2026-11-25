import type { FestivalEventConfig } from "./types";

export const songkranConfig = {
  id: "songkran",
  name: "Songkran",
  nameTh: "สงกรานต์",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — DRAFT: §1.1.6; the §1 table says 13–15 Apr. */
  dateWindows: [
    { startsAt: "2027-04-10T00:00:00+07:00", endsAt: "2027-04-17T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
