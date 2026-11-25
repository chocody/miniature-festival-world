"use client";

import { useId, type ReactElement } from "react";
import { WISH_SWITCH_COPY } from "@/config/wish.config";

export interface WishVisibilitySwitchProps {
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean; // default false
  readonly busy?: boolean; // default false; implies disabled, sets aria-busy
  readonly animate: boolean; // WishModal: !reducedMotion; owner UI: false
  readonly describedBy?: string; // extra ids appended after the helper id in aria-describedby
}

/** The one "เปิดให้ทุกคนเห็น" switch (owner decisions 29 and 36), shared by the wish step and the owner controls. Presentational only. */
export function WishVisibilitySwitch({
  checked,
  onToggle,
  disabled = false,
  busy = false,
  animate,
  describedBy,
}: WishVisibilitySwitchProps): ReactElement {
  const ids = useId();
  const labelId = `${ids}-label`;
  const helperId = `${ids}-helper`;
  return (
    <div className="flex flex-col gap-1" data-testid="wish-visibility-switch" data-checked={checked ? "true" : "false"}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="font-semibold">
          {WISH_SWITCH_COPY.label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-describedby={describedBy ? `${helperId} ${describedBy}` : helperId}
          aria-busy={busy || undefined}
          disabled={disabled || busy}
          onClick={onToggle}
          className={`relative inline-flex min-h-11 min-w-11 w-16 shrink-0 items-center rounded-full p-1${animate ? " transition-colors" : ""} ${
            checked ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-600"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span aria-hidden="true" className={`h-9 w-9 rounded-full bg-white shadow${checked ? " translate-x-5" : ""}`} />
        </button>
      </div>
      <p id={helperId} className="text-sm text-zinc-600 dark:text-zinc-300">
        {WISH_SWITCH_COPY.helper}
      </p>
    </div>
  );
}
