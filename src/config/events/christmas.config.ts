import type { FestivalEventConfig } from "./types";

export const christmasConfig = {
  id: "christmas",
  name: "Christmas",
  nameTh: "คริสต์มาส",
  /** Date windows (Asia/Bangkok, end exclusive; MFW-53) — owner decision, open question 14 (docs/spec/01-roadmap.md §1.1.2). */
  dateWindows: [
    { startsAt: "2026-12-20T00:00:00+07:00", endsAt: "2026-12-27T00:00:00+07:00" },
  ],
} as const satisfies FestivalEventConfig;
