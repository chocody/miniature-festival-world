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

export interface FestivalEventConfig {
  readonly id: FestivalEventId;
  readonly name: string;
  readonly nameTh: string;
}
