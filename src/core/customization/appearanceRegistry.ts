import type { FestivalEventId } from "@/config/events/types";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";
import { DEFAULT_ORNAMENT_APPEARANCE, parseOrnamentAppearance } from "./ornamentAppearance";
import { DEFAULT_STAR_APPEARANCE, parseStarAppearance } from "./starAppearance";
import type { AppearanceParseResult, EventAppearance, KrathongAppearance } from "./types";

type AppearanceParser = (input: unknown) => AppearanceParseResult<EventAppearance>;
const APPEARANCE_PARSERS: ReadonlyMap<FestivalEventId, AppearanceParser> = new Map<FestivalEventId, AppearanceParser>([
  ["loy_krathong", parseKrathongAppearance],
  ["christmas", parseOrnamentAppearance],
  ["new_year", parseStarAppearance],
]);

const DEFAULT_APPEARANCES: ReadonlyMap<FestivalEventId, EventAppearance> = new Map<FestivalEventId, EventAppearance>([
  ["loy_krathong", DEFAULT_KRATHONG_APPEARANCE],
  ["christmas", DEFAULT_ORNAMENT_APPEARANCE],
  ["new_year", DEFAULT_STAR_APPEARANCE],
]);

/** Server write-path gate for creations_public.appearance, keyed by event. Never throws. */
export function parseEventAppearance(eventId: FestivalEventId, input: unknown): AppearanceParseResult<EventAppearance> {
  const parser = APPEARANCE_PARSERS.get(eventId);
  if (!parser) return { ok: false, reason: `no appearance schema for event: ${eventId}` };
  return parser(input);
}

/** The frozen default appearance of an event (the constants themselves), or null for an event without a schema. */
export function defaultEventAppearance(eventId: FestivalEventId): EventAppearance | null {
  return DEFAULT_APPEARANCES.get(eventId) ?? null;
}

/**
 * No tag in the union. A krathong appearance always has an own `base`. Ornament and star are exactly `{design}` (their
 * parsers reject `base`), so they never do. Ornament vs star is not decided by shape: use the event id.
 */
export function isKrathongAppearance(a: EventAppearance): a is KrathongAppearance {
  return Object.prototype.hasOwnProperty.call(a, "base");
}
