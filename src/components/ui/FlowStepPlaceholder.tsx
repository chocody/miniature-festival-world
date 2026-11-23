"use client";

import type { FlowState } from "@/core/flow";

export interface FlowStepPlaceholderProps {
  step: FlowState;
  nextLabel?: string;
  onNext?: () => void;
}

/** Stand-in for flow steps whose real UI arrives in later tickets. */
export function FlowStepPlaceholder({ step, nextLabel = "ถัดไป", onNext }: FlowStepPlaceholderProps) {
  return (
    <section className="flex w-full flex-col items-start gap-4">
      <h2 className="text-xl font-semibold">{step}</h2>
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          className="min-h-12 rounded-full bg-zinc-900 px-5 text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {nextLabel}
        </button>
      )}
    </section>
  );
}
