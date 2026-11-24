import type { FestivalEventId } from "@/config/events/types";
import { parseKrathongAppearance } from "./krathongAppearance";
import type { AppearanceParseResult, EventAppearance } from "./types";

const APPEARANCE_PARSERS: ReadonlyMap<FestivalEventId, (input: unknown) => AppearanceParseResult<EventAppearance>> =
  new Map([["loy_krathong", parseKrathongAppearance]]);

/** Server write-path gate for creations_public.appearance, keyed by event. Never throws. */
export function parseEventAppearance(eventId: FestivalEventId, input: unknown): AppearanceParseResult<EventAppearance> {
  const parser = APPEARANCE_PARSERS.get(eventId);
  if (!parser) return { ok: false, reason: `no appearance schema for event: ${eventId}` };
  return parser(input);
}
