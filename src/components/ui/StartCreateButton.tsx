"use client";

import { useEventCopy } from "./EventCopyContext";
import { PRIMARY_ACTION_PROPS, UI_CLASSES } from "./uiClasses";

export interface StartCreateButtonProps {
  /** Dispatches START_CREATE (MFW-154). */
  readonly onPress: () => void;
}

/** The landing view's primary action (MFW-154): opens the customizer. The label comes from the per-event copy table. */
export function StartCreateButton({ onPress }: StartCreateButtonProps) {
  const label = useEventCopy().create.start;
  return (
    <button
      {...PRIMARY_ACTION_PROPS}
      type="button"
      data-testid="start-create"
      onClick={onPress}
      className={`${UI_CLASSES.primaryButton} shrink-0 transition-colors motion-reduce:transition-none`}
    >
      {label}
    </button>
  );
}
