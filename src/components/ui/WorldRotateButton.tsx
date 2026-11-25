"use client";

import { WORLD_VIEW_ROTATE_BUTTON_COPY } from "@/config/interaction.config";
import { UI_CLASSES } from "./uiClasses";

/**
 * MFW-55 icon button on the translucent veil (it floats over the scene), 44 px (`min-h-11 min-w-11` = MIN_TOUCH_TARGET_PX);
 * the focus ring is the global `:focus-visible` rule in globals.css. DRAFT placement (MFW-57): right edge, just below the
 * middle of the screen, outside the scene section, clear of the world top card (max 50dvh) and the bottom sheet.
 */
export const WORLD_ROTATE_BUTTON_CLASSES = `${UI_CLASSES.iconButton.replace("bg-paper", "bg-veil")} shadow-float pointer-events-auto fixed top-[58dvh] right-[max(var(--spacing-gutter),env(safe-area-inset-right))] z-20`;

/** WORLD_EXPLORE rotate button (open question 34): one tap turns the view by WORLD_VIEW_ROTATE_STEP_RADIANS. */
export function WorldRotateButton({ onRotate }: { onRotate: () => void }) {
  return (
    <button
      type="button"
      aria-label={WORLD_VIEW_ROTATE_BUTTON_COPY.ariaLabel}
      className={WORLD_ROTATE_BUTTON_CLASSES}
      onClick={onRotate}
    >
      <span aria-hidden="true">{WORLD_VIEW_ROTATE_BUTTON_COPY.glyph}</span>
    </button>
  );
}
