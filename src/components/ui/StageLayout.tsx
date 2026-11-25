import type { ReactNode } from "react";

/**
 * Full-screen stage layout (MFW-54, backlog 10.2, owner decision 28). Responsive by CSS only (Tailwind `md:` = 48rem): never branch
 * on width in JS, so a rotation or resize never re-mounts the scene. The stage fills the screen (viewport-fit=cover) and every slot
 * is inset by the safe area. Sizes are DRAFT layout values (spec silent); MFW-55 restyles.
 */
export const STAGE_LAYOUT_CLASSES = Object.freeze({
  root: "fixed inset-0 h-dvh w-dvw overflow-hidden overscroll-none",
  stage: "absolute inset-0",
  overlay: "pointer-events-none absolute inset-0 z-10",
  top: "pointer-events-auto fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] left-[max(0.75rem,env(safe-area-inset-left))] flex max-h-[50dvh] flex-col gap-2 overflow-y-auto rounded-2xl bg-white/90 p-3 text-zinc-900 shadow-lg *:mb-0 dark:bg-zinc-900/90 dark:text-zinc-100 md:right-auto md:w-80",
  panel: "pointer-events-auto fixed right-0 bottom-0 left-0 max-h-[60dvh] overflow-y-auto rounded-t-3xl border-t border-black/10 bg-white/95 pt-3 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] text-zinc-900 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] *:mb-0 dark:border-white/15 dark:bg-zinc-900/95 dark:text-zinc-100 md:top-[max(0.75rem,env(safe-area-inset-top))] md:right-[max(0.75rem,env(safe-area-inset-right))] md:bottom-auto md:left-auto md:max-h-[calc(100dvh-1.5rem)] md:w-96 md:rounded-3xl md:border md:p-4",
  dialog: "pointer-events-auto fixed inset-0 flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] *:my-auto *:w-full *:max-w-lg",
  sheet: "pointer-events-auto fixed right-0 bottom-0 left-0 z-30 max-h-[60dvh] overflow-y-auto pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] *:mb-0 md:top-[max(0.75rem,env(safe-area-inset-top))] md:right-[max(0.75rem,env(safe-area-inset-right))] md:bottom-auto md:left-auto md:max-h-[calc(100dvh-1.5rem)] md:w-96 md:p-0",
  debug: "pointer-events-auto fixed top-[40dvh] left-[max(0.75rem,env(safe-area-inset-left))] z-30 max-h-[35dvh] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl bg-white/90 text-zinc-900 *:mb-0 dark:bg-zinc-900/90 dark:text-zinc-100",
} as const);

export type OverlaySlotKind = "top" | "panel" | "dialog" | "sheet" | "debug";

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
