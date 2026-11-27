import type { FestivalEventId } from "@/config/events/types";
import { DEFAULT_KRATHONG_APPEARANCE, parseKrathongAppearance } from "./krathongAppearance";
import { DEFAULT_ORNAMENT_APPEARANCE, parseOrnamentAppearance } from "./ornamentAppearance";
import type { AppearanceParseResult, EventAppearance, KrathongAppearance } from "./types";

type AppearanceParser = (input: unknown) => AppearanceParseResult<EventAppearance>;
const APPEARANCE_PARSERS: ReadonlyMap<FestivalEventId, AppearanceParser> = new Map<FestivalEventId, AppearanceParser>([
  ["loy_krathong", parseKrathongAppearance],
  ["christmas", parseOrnamentAppearance],
]);

const DEFAULT_APPEARANCES: ReadonlyMap<FestivalEventId, EventAppearance> = new Map<FestivalEventId, EventAppearance>([
  ["loy_krathong", DEFAULT_KRATHONG_APPEARANCE],
  ["christmas", DEFAULT_ORNAMENT_APPEARANCE],
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

/** The union has no tag ({design} is the exact ornament key set): a krathong appearance has an own `base`. */
export function isKrathongAppearance(a: EventAppearance): a is KrathongAppearance {
  return Object.prototype.hasOwnProperty.call(a, "base");
}
