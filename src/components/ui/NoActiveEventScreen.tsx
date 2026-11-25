import { NO_ACTIVE_EVENT_COPY } from "@/config/noActiveEvent.config";
import type { FestivalDatesView } from "@/core/events";

export interface NoActiveEventScreenProps {
  readonly festival: FestivalDatesView | null;
}

/** The one calm screen shown when no festival is on (open question 33, MFW-53). No controls: nothing can be created. */
export function NoActiveEventScreen({ festival }: NoActiveEventScreenProps) {
  return (
    <section
      aria-label={NO_ACTIVE_EVENT_COPY.regionLabel}
      data-testid="no-active-event"
      data-nearest-event={festival?.eventId}
      className="flex min-h-[60vh] w-full items-center justify-center"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border border-amber-200/70 bg-amber-50/70 px-8 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/70">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{NO_ACTIVE_EVENT_COPY.lead}</p>
        {festival && (
          <>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{festival.nameTh}</h1>
            <p lang="en" className="text-base text-zinc-700 dark:text-zinc-200">
              {festival.name}
            </p>
            {festival.datesLabel !== null && (
              <p data-testid="no-active-event-dates" className="text-base text-amber-800 dark:text-amber-200">
                {festival.datesLabel}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
