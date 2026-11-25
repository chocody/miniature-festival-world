"use client";

import { MIN_TOUCH_TARGET_PX } from "@/config/customizer.config";
import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";

/** DRAFT placement (MFW-57; MFW-55 restyles): fixed at the right edge, mid-height, outside the scene section. */
export const WORLD_ROTATE_BUTTON_CLASSES =
  "pointer-events-auto fixed top-[50dvh] right-[max(0.75rem,env(safe-area-inset-right))] z-20 -translate-y-1/2 grid place-items-center rounded-full bg-white/90 px-3 text-sm font-semibold text-zinc-900 shadow-lg dark:bg-zinc-900/90 dark:text-zinc-100";

/** WORLD_EXPLORE rotate button (open question 34): one tap turns the view by WORLD_VIEW_ROTATE_STEP_RADIANS. */
export function WorldRotateButton({ onRotate }: { onRotate: () => void }) {
  return (
    <button
      type="button"
      aria-label={WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel}
      className={WORLD_ROTATE_BUTTON_CLASSES}
      style={{ minWidth: MIN_TOUCH_TARGET_PX, minHeight: MIN_TOUCH_TARGET_PX }}
      onClick={onRotate}
    >
      {WORLD_VIEW_ROTATE_BUTTON_COPY.label}
    </button>
  );
}
