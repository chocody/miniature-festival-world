import { chineseNewYearConfig } from "./chineseNewYear.config";
import { christmasConfig } from "./christmas.config";
import { halloweenConfig } from "./halloween.config";
import { loyKrathongConfig } from "./loyKrathong.config";
import { midAutumnConfig } from "./midAutumn.config";
import { newYearConfig } from "./newYear.config";
import { songkranConfig } from "./songkran.config";
import type { FestivalEventConfig, FestivalEventId } from "./types";
import { valentinesConfig } from "./valentines.config";

export * from "./types";

/** All roadmap festivals in roadmap order #1–#8 (docs/spec/01-roadmap.md). */
export const FESTIVAL_EVENTS: readonly FestivalEventConfig[] = Object.freeze([
  loyKrathongConfig,
  christmasConfig,
  newYearConfig,
  chineseNewYearConfig,
  valentinesConfig,
  songkranConfig,
  midAutumnConfig,
  halloweenConfig,
]);

/** Returns the config for a festival id, or undefined for an unknown id. */
export function getEventConfig(id: FestivalEventId): FestivalEventConfig | undefined {
  return FESTIVAL_EVENTS.find((event) => event.id === id);
}
