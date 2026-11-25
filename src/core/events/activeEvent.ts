import {
  FESTIVAL_EVENTS,
  FESTIVAL_EVENT_IDS,
  type EventDateWindow,
  type FestivalEventConfig,
  type FestivalEventId,
} from "@/config/events";
import { EVENT_FEATURE_FLAGS, isEventEnabled, type EventFeatureFlags } from "@/config/featureFlags.config";

export interface FestivalWindowRef {
  readonly eventId: FestivalEventId;
  readonly window: EventDateWindow;
}

export type ActiveEventResolution =
  | { readonly kind: "active"; readonly eventId: FestivalEventId; readonly source: "override" | "date" }
  | { readonly kind: "none"; readonly nearest: FestivalWindowRef | null };

export interface ResolveActiveEventOptions {
  readonly override?: FestivalEventId | null;
  readonly events?: readonly FestivalEventConfig[];
  readonly flags?: EventFeatureFlags;
}

interface ParsedWindow {
  readonly ref: FestivalWindowRef;
  readonly startMs: number;
  readonly endMs: number;
}

/** Every valid window (parsable bounds, end after start) in roadmap scan order. */
function parseWindows(events: readonly FestivalEventConfig[]): ParsedWindow[] {
  const out: ParsedWindow[] = [];
  for (const event of events) {
    for (const window of event.dateWindows) {
      const startMs = Date.parse(window.startsAt);
      const endMs = Date.parse(window.endsAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
      out.push({ ref: { eventId: event.id, window }, startMs, endMs });
    }
  }
  return out;
}

/**
 * Nearest window in time, past or upcoming (flags ignored). Ties: an upcoming window beats an
 * ended/inside one, then scan order. Null for a non-finite time or no valid window.
 */
export function findNearestWindow(
  nowMs: number,
  events: readonly FestivalEventConfig[] = FESTIVAL_EVENTS,
): FestivalWindowRef | null {
  if (!Number.isFinite(nowMs)) return null;
  let best: { ref: FestivalWindowRef; distance: number; upcoming: boolean } | null = null;
  for (const w of parseWindows(events)) {
    const upcoming = w.startMs > nowMs;
    const distance = upcoming ? w.startMs - nowMs : nowMs >= w.endMs ? nowMs - w.endMs : 0;
    if (best === null || distance < best.distance || (distance === best.distance && upcoming && !best.upcoming)) {
      best = { ref: w.ref, distance, upcoming };
    }
  }
  return best === null ? null : best.ref;
}

/** Pure: never reads the clock; the caller passes `nowMs`. The date windows are Asia/Bangkok (MFW-53). */
export function resolveActiveEvent(nowMs: number, options: ResolveActiveEventOptions = {}): ActiveEventResolution {
  const override = options.override ?? null;
  const events = options.events ?? FESTIVAL_EVENTS;
  const flags = options.flags ?? EVENT_FEATURE_FLAGS;

  if (override !== null) {
    if ((FESTIVAL_EVENT_IDS as readonly string[]).includes(override) && isEventEnabled(override, flags)) {
      return { kind: "active", eventId: override, source: "override" };
    }
    return { kind: "none", nearest: findNearestWindow(nowMs, events) }; // fail closed
  }
  if (!Number.isFinite(nowMs)) return { kind: "none", nearest: null };

  for (const w of parseWindows(events)) {
    if (w.startMs <= nowMs && nowMs < w.endMs && isEventEnabled(w.ref.eventId, flags)) {
      return { kind: "active", eventId: w.ref.eventId, source: "date" };
    }
  }
  return { kind: "none", nearest: findNearestWindow(nowMs, events) };
}

export function isEventActive(eventId: FestivalEventId, nowMs: number, options?: ResolveActiveEventOptions): boolean {
  const r = resolveActiveEvent(nowMs, options);
  return r.kind === "active" && r.eventId === eventId;
}
