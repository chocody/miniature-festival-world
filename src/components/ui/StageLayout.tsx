import type { ReactNode } from "react";

/**
 * Full-screen stage layout (MFW-54, backlog 10.2, owner decision 28). Responsive by CSS only (Tailwind `md:` = 48rem): never branch
 * on width in JS, so a rotation or resize never re-mounts the scene. The stage fills the screen (viewport-fit=cover) and every slot
 * is inset by the safe area. Sizes are DRAFT layout values (spec silent); restyled in MFW-55. `hint` (the first-visit tap hint) floats
 * between the top card and the bottom sheet and never takes a touch. `corner` (MFW-47, MFW-74) is the HUD column top-left: round 44 px buttons (Find My, day/night toggle, rotate),
 * stacked. `top` starts to the right of that column (2.75rem = `min-w-11` = MIN_TOUCH_TARGET_PX plus a gutter).
 */
export const STAGE_LAYOUT_CLASSES = Object.freeze({
  root: "fixed inset-0 h-dvh w-dvw overflow-hidden overscroll-none bg-stage text-ink",
  stage: "absolute inset-0",
  overlay: "pointer-events-none absolute inset-0 z-10",
  top: "pointer-events-auto fixed top-[max(var(--spacing-gutter),env(safe-area-inset-top))] right-[max(var(--spacing-gutter),env(safe-area-inset-right))] left-[calc(max(var(--spacing-gutter),env(safe-area-inset-left))+2.75rem+var(--spacing-gutter))] flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-card bg-veil p-2 text-ink shadow-float *:mb-0 md:right-auto md:w-80",
  panel: "pointer-events-auto fixed right-0 bottom-0 left-0 max-h-[60dvh] overflow-y-auto rounded-t-sheet bg-veil pt-card pr-[max(var(--spacing-card),env(safe-area-inset-right))] pb-[max(var(--spacing-card),env(safe-area-inset-bottom))] pl-[max(var(--spacing-card),env(safe-area-inset-left))] text-ink shadow-sheet *:mb-0 md:top-[max(var(--spacing-gutter),env(safe-area-inset-top))] md:right-[max(var(--spacing-gutter),env(safe-area-inset-right))] md:bottom-auto md:left-auto md:max-h-[calc(100dvh-2*var(--spacing-gutter))] md:w-96 md:rounded-sheet md:p-card md:shadow-float",
  dialog: "pointer-events-auto fixed inset-0 flex items-start justify-center overflow-y-auto pt-[max(var(--spacing-gutter),env(safe-area-inset-top))] pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pb-[max(var(--spacing-gutter),env(safe-area-inset-bottom))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] *:my-auto *:w-full *:max-w-lg",
  sheet: "pointer-events-auto fixed right-0 bottom-0 left-0 z-30 max-h-[60dvh] overflow-y-auto pr-[max(var(--spacing-gutter),env(safe-area-inset-right))] pb-[max(var(--spacing-gutter),env(safe-area-inset-bottom))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] *:mb-0 md:top-[max(var(--spacing-gutter),env(safe-area-inset-top))] md:right-[max(var(--spacing-gutter),env(safe-area-inset-right))] md:bottom-auto md:left-auto md:max-h-[calc(100dvh-2*var(--spacing-gutter))] md:w-96 md:p-0",
  corner: "pointer-events-auto fixed top-[max(var(--spacing-gutter),env(safe-area-inset-top))] left-[max(var(--spacing-gutter),env(safe-area-inset-left))] z-20 flex flex-col items-start gap-2",
  hint: "pointer-events-none fixed top-[30dvh] right-0 left-0 z-30 flex justify-center",
  debug: "pointer-events-auto fixed top-[40dvh] left-[max(var(--spacing-gutter),env(safe-area-inset-left))] z-30 max-h-[35dvh] w-72 max-w-[calc(100vw-2*var(--spacing-gutter))] overflow-y-auto rounded-card bg-veil text-ink *:mb-0",
} as const);

export type OverlaySlotKind = "top" | "panel" | "dialog" | "sheet" | "corner" | "hint" | "debug";

export interface OverlaySlotProps {
  readonly slot: OverlaySlotKind;
  readonly children: ReactNode;
}

/** One positioned overlay region; `data-overlay-slot` is the test/e2e hook. */
export function OverlaySlot({ slot, children }: OverlaySlotProps) {
  return (
    <div data-overlay-slot={slot} className={STAGE_LAYOUT_CLASSES[slot]}>
      {children}
    </div>
  );
}
