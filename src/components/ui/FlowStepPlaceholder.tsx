"use client";

import type { FlowState } from "@/core/flow";
import { useEventCopy } from "./EventCopyContext";
import { PRIMARY_ACTION_PROPS, UI_CLASSES } from "./uiClasses";

export interface FlowStepPlaceholderProps {
  step: FlowState;
  nextLabel?: string;
  onNext?: () => void;
}

/** Stand-in for flow steps whose real UI arrives in later tickets. Shows the step's Thai title and hint (MFW-55). */
export function FlowStepPlaceholder({ step, nextLabel = "ถัดไป", onNext }: FlowStepPlaceholderProps) {
  const copy = useEventCopy().flowSteps[step];
  return (
    <section className="flex w-full flex-col items-start gap-1">
      <h2 className={UI_CLASSES.title}>{copy.title}</h2>
      {copy.hint && <p className={UI_CLASSES.caption}>{copy.hint}</p>}
      {onNext && (
        <button {...PRIMARY_ACTION_PROPS} type="button" onClick={onNext} className={`${UI_CLASSES.primaryButton} mt-2`}>
          {nextLabel}
        </button>
      )}
    </section>
  );
}
