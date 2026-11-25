import { getEventConfig, type EventDateWindow, type FestivalEventId } from "@/config/events";
import {
  DATE_RANGE_DASH,
  EVENT_UTC_OFFSET_MINUTES,
  MS_PER_MINUTE,
  THAI_MONTH_ABBREVIATIONS,
} from "@/config/eventCalendar.config";
import type { FestivalWindowRef } from "./activeEvent";

export interface FestivalDatesView {
  readonly eventId: FestivalEventId;
  readonly name: string;
  readonly nameTh: string;
  readonly datesLabel: string | null;
}

interface CalendarDay {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/** Calendar date in Bangkok via a fixed +7 h shift (no Intl: independent of ICU and the host zone). */
function bangkokDay(ms: number): CalendarDay {
  const d = new Date(ms + EVENT_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

/** "24 พ.ย. 2026", "20–26 ธ.ค. 2026", "28 ก.ย. – 3 ต.ค. 2027"; null for an invalid window. */
export function formatEventDateRange(window: EventDateWindow): string | null {
  const startMs = Date.parse(window.startsAt);
  const endMs = Date.parse(window.endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const a = bangkokDay(startMs);
  const b = bangkokDay(endMs - 1);
  const month = (d: CalendarDay) => THAI_MONTH_ABBREVIATIONS[d.month];
  if (a.year === b.year && a.month === b.month) {
    if (a.day === b.day) return `${a.day} ${month(a)} ${a.year}`;
    return `${a.day}${DATE_RANGE_DASH}${b.day} ${month(a)} ${a.year}`;
  }
  if (a.year === b.year) return `${a.day} ${month(a)} ${DATE_RANGE_DASH} ${b.day} ${month(b)} ${b.year}`;
  return `${a.day} ${month(a)} ${a.year} ${DATE_RANGE_DASH} ${b.day} ${month(b)} ${b.year}`;
}

export function describeFestivalWindow(ref: FestivalWindowRef): FestivalDatesView {
  const config = getEventConfig(ref.eventId);
  return {
    eventId: ref.eventId,
    name: config?.name ?? ref.eventId,
    nameTh: config?.nameTh ?? ref.eventId,
    datesLabel: formatEventDateRange(ref.window),
  };
}
