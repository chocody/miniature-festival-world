import { describeFestivalWindow, type ActiveEventResolution } from "@/core/events";
import { FlowRoot } from "./FlowRoot";
import { NoActiveEventScreen } from "./NoActiveEventScreen";

export interface ActiveEventViewProps {
  readonly resolution: ActiveEventResolution;
}

/** Opens straight into the active event, or the calm screen when none is on (MFW-53). */
export function ActiveEventView({ resolution }: ActiveEventViewProps) {
  if (resolution.kind === "active") return <FlowRoot eventId={resolution.eventId} />;
  return (
    <NoActiveEventScreen
      festival={resolution.nearest === null ? null : describeFestivalWindow(resolution.nearest)}
    />
  );
}
