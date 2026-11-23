"use client";

import { FESTIVAL_EVENTS, type FestivalEventConfig, type FestivalEventId } from "@/config/events";
import { EVENT_FEATURE_FLAGS, isEventEnabled, type EventFeatureFlags } from "@/config/featureFlags.config";

export interface EventSelectorProps {
  events?: readonly FestivalEventConfig[];
  flags?: EventFeatureFlags;
  onSelect: (id: FestivalEventId) => void;
}

/** Festival picker: enabled festivals are selectable, the rest show "Coming Soon". */
export function EventSelector({ events = FESTIVAL_EVENTS, flags = EVENT_FEATURE_FLAGS, onSelect }: EventSelectorProps) {
  return (
    <section className="flex w-full flex-col gap-4" aria-labelledby="event-selector-heading">
      <h1 id="event-selector-heading" className="text-2xl font-semibold">
        เลือกเทศกาล
      </h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {events.map((event) => {
          const enabled = isEventEnabled(event.id, flags);
          return (
            <li key={event.id}>
              <button
                type="button"
                disabled={!enabled}
                data-event-id={event.id}
                onClick={() => {
                  if (enabled) onSelect(event.id);
                }}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-left shadow-sm transition-colors enabled:hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-zinc-900 dark:enabled:hover:bg-zinc-800"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{event.name}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{event.nameTh}</span>
                </span>
                {!enabled && (
                  <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    Coming Soon
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
