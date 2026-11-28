import type { FestivalEventId } from "@/config/events/types";
import type { CoordMode } from "@/core/coordinates/types";

/** The coord mode a creation of each event is stored with (the 201 check uses it). */
export const EVENT_COORD_MODES: Readonly<Partial<Record<FestivalEventId, CoordMode>>> = Object.freeze({
  loy_krathong: "SPLINE_PATH",
  christmas: "CYLINDRICAL_SURFACE",
});

export function coordModeForEvent(eventId: FestivalEventId): CoordMode | null {
  return Object.prototype.hasOwnProperty.call(EVENT_COORD_MODES, eventId) ? (EVENT_COORD_MODES[eventId] ?? null) : null;
}
