"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FestivalEventId } from "@/config/events";
import { getEventCopy, type EventCopy } from "@/config/events/eventCopy.config";
import { LOY_KRATHONG_COPY } from "@/config/events/loyKrathong.copy";

/** The default is Loy, so components rendered without a provider keep the Loy text (MFW-91). */
const EventCopyContext = createContext<EventCopy>(LOY_KRATHONG_COPY);

export function EventCopyProvider({
  eventId,
  children,
}: {
  readonly eventId: FestivalEventId | null;
  readonly children: ReactNode;
}) {
  // getEventCopy returns a stable module object, so no memo is needed.
  return <EventCopyContext.Provider value={getEventCopy(eventId)}>{children}</EventCopyContext.Provider>;
}

export function useEventCopy(): EventCopy {
  return useContext(EventCopyContext);
}
