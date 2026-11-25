import { ACTIVE_EVENT_OVERRIDE } from "@/config/activeEvent.config";
import type { FestivalEventId } from "@/config/events/types";
import { isEventActive, resolveActiveEvent, type ActiveEventResolution } from "@/core/events";

/** The ONE resolver the page and POST /api/creations share (MFW-53). Server-only: never import from a "use client" module. */
export function resolveServerActiveEvent(nowMs: number): ActiveEventResolution {
  return resolveActiveEvent(nowMs, { override: ACTIVE_EVENT_OVERRIDE });
}

export function isServerActiveEvent(eventId: FestivalEventId, nowMs: number): boolean {
  return isEventActive(eventId, nowMs, { override: ACTIVE_EVENT_OVERRIDE });
}
