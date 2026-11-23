"use client";

import type { FlowEvent, FlowState } from "@/core/flow";
import { useUIStore } from "@/store/useUIStore";
import { EventSelector } from "./EventSelector";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";

/** Event that advances each placeholder step; LANDING and the terminal step have none. */
const NEXT_EVENT: Partial<Record<FlowState, FlowEvent>> = {
  CUSTOMIZE_OBJECT: { type: "FINISH_CUSTOMIZE" },
  WRITE_WISH: { type: "SUBMIT_WISH" },
  RITUAL_RELEASE: { type: "FINISH_RITUAL" },
};

/** Renders the current step of the user flow from useUIStore. */
export function FlowRoot() {
  const flowState = useUIStore((s) => s.flowState);
  const dispatch = useUIStore((s) => s.dispatch);
  const nextEvent = NEXT_EVENT[flowState];

  return (
    <div data-flow-state={flowState} className="flex w-full flex-col">
      {flowState === "LANDING_EVENT_SELECT" ? (
        <EventSelector onSelect={(eventId) => dispatch({ type: "SELECT_EVENT", eventId })} />
      ) : (
        <FlowStepPlaceholder step={flowState} onNext={nextEvent ? () => dispatch(nextEvent) : undefined} />
      )}
    </div>
  );
}
