"use client";

import { useId, type ReactElement } from "react";
import { WISH_SWITCH_COPY } from "@/config/wish.config";
import { UI_CLASSES } from "./uiClasses";

export interface WishVisibilitySwitchProps {
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean; // default false
  readonly busy?: boolean; // default false; implies disabled, sets aria-busy
  readonly animate: boolean; // WishModal: !reducedMotion; owner UI: false
  readonly describedBy?: string; // extra ids appended after the helper id in aria-describedby
}

/**
 * Geometry (symmetric): track 64 × 44 px (h-11 = the touch target), knob 36 px, 4 px inset on every side. The knob is absolutely
 * positioned at left-1/top-1 and travels 20 px (translate-x-5 = 64 − 36 − 2 × 4), so both states leave 4 px on each side.
 * The one "เปิดให้ทุกคนเห็น" switch (owner decisions 29 and 36), shared by the wish step and the owner controls. Presentational only. */
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
        <span id={labelId} className={UI_CLASSES.subheading}>
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
          className={`relative block h-11 min-h-11 w-16 min-w-11 shrink-0 rounded-full${animate ? " transition-colors" : ""} ${
            checked ? "bg-clay" : "bg-track"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span
            aria-hidden="true"
            data-testid="wish-switch-knob"
            className={`absolute top-1 left-1 size-9 rounded-full bg-paper shadow-raised${checked ? " translate-x-5" : ""}`}
          />
        </button>
      </div>
      <p id={helperId} className={UI_CLASSES.caption}>
        {WISH_SWITCH_COPY.helper}
      </p>
    </div>
  );
}
