"use client";

import { RELEASE_SCENE_WATCHDOG_MS, RITUAL_COPY } from "@/config/ritual.config";
import { getReleaseCreation, type ReleaseCreation } from "@/services/api/releaseCreation";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useEffect } from "react";

export interface RitualReleasePanelProps {
  /** True when a 3D scene animates the ritual (FlowRoot's show3D). False → completes without animation (FALLBACK_2D). */
  readonly animateInScene: boolean;
  /** Injected in tests; default getReleaseCreation(). */
  readonly releaser?: Pick<ReleaseCreation, "release">;
}

/** The release button and status line of RITUAL_RELEASE (MFW-23). Works without any scene (FALLBACK_2D). */
export function RitualReleasePanel({ animateInScene, releaser }: RitualReleasePanelProps) {
  const ritual = useUIStore((s) => s.ritual);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);

  useEffect(() => {
    if (!animateInScene) useUIStore.getState().dispatchRitual({ type: "SKIP_ANIMATION" });
  }, [animateInScene, ritual.instant, ritual.phase]);

  // Watchdog: saved but the scene never finished the animation → skip it so the flow reaches the world.
  const waitingForScene = ritual.phase === "RELEASING" && ritual.saved !== null;
  useEffect(() => {
    if (!waitingForScene) return;
    const timer = setTimeout(
      () => useUIStore.getState().dispatchRitual({ type: "SKIP_ANIMATION" }),
      RELEASE_SCENE_WATCHDOG_MS,
    );
    return () => clearTimeout(timer);
  }, [waitingForScene, ritual.attempt]);

  const status =
    ritual.phase === "RELEASING"
      ? RITUAL_COPY.releasing
      : ritual.phase === "IDLE" && ritual.error
        ? RITUAL_COPY.errors[ritual.error.kind]
        : ritual.phase === "IDLE" && ritual.hint
          ? RITUAL_COPY.dropOnWater
          : "";

  return (
    <section
      aria-label={RITUAL_COPY.panelLabel}
      data-testid="ritual-release-panel"
      className="flex w-full flex-col items-start gap-4"
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{RITUAL_COPY.hint}</p>
      <button
        type="button"
        disabled={ritual.phase !== "IDLE"}
        onClick={() => void (releaser ?? getReleaseCreation()).release({ kind: "pier" })}
        className={`min-h-12 rounded-full bg-zinc-900 px-5 text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 ${reducedMotion ? "" : "transition-colors hover:bg-zinc-700 dark:hover:bg-zinc-300"}`}
      >
        {RITUAL_COPY.releaseButton}
      </button>
      <p role="status" aria-live="polite" data-testid="ritual-status" className="text-sm">
        {status}
      </p>
    </section>
  );
}
