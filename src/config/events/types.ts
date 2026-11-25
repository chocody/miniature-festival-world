/** Ids of every festival on the roadmap (docs/spec/01-roadmap.md), in roadmap order #1–#8. */
export const FESTIVAL_EVENT_IDS = [
  "loy_krathong",
  "christmas",
  "new_year",
  "chinese_new_year",
  "valentines",
  "songkran",
  "mid_autumn",
  "halloween",
] as const;

export type FestivalEventId = (typeof FESTIVAL_EVENT_IDS)[number];

/** A date window, ISO-8601 at a Bangkok midnight with "+07:00". startsAt inclusive, endsAt exclusive. */
export interface EventDateWindow {
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface FestivalEventConfig {
  readonly id: FestivalEventId;
  readonly name: string;
  readonly nameTh: string;
  /** Roadmap occurrences, chronological, at least one (MFW-53). */
  readonly dateWindows: readonly [EventDateWindow, ...EventDateWindow[]];
}
