import { NO_ACTIVE_EVENT_COPY } from "@/config/noActiveEvent.config";
import type { FestivalDatesView } from "@/core/events";
import { UI_CLASSES } from "./uiClasses";

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
      className="flex min-h-dvh w-full items-center justify-center bg-stage px-4 py-8 text-ink"
    >
      <div className={`flex w-full max-w-md flex-col items-center gap-3 ${UI_CLASSES.floating} px-8 py-12 text-center`}>
        <p className="text-body text-ink-muted">{NO_ACTIVE_EVENT_COPY.lead}</p>
        {festival && (
          <>
            <h1 className="text-display font-semibold text-ink">{festival.nameTh}</h1>
            <p lang="en" className="text-body text-ink-muted">
              {festival.name}
            </p>
            {festival.datesLabel !== null && (
              <p data-testid="no-active-event-dates" className="text-body font-medium text-clay">
                {festival.datesLabel}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
