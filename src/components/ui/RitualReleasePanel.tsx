"use client";

import { RELEASE_SCENE_WATCHDOG_MS, RITUAL_COPY } from "@/config/ritual.config";
import { getReleaseCreation, type ReleaseCreation } from "@/services/api/releaseCreation";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useEffect } from "react";
import { PRIMARY_ACTION_PROPS, UI_CLASSES } from "./uiClasses";

export interface RitualReleasePanelProps {
  /** True when a 3D scene animates the ritual (FlowRoot's show3D). False → completes without animation. */
  readonly animateInScene: boolean;
  /** Injected in tests; default getReleaseCreation(). */
  readonly releaser?: Pick<ReleaseCreation, "release">;
}

/** The release button and status line of RITUAL_RELEASE (MFW-23). Works without any scene. */
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

  // `md:w-auto` must not touch a `${...}` in the source: Tailwind's scanner would not extract it.
  return (
    <section
      aria-label={RITUAL_COPY.panelLabel}
      data-testid="ritual-release-panel"
      className="flex w-full flex-col items-stretch gap-3 md:items-start"
    >
      <p className={UI_CLASSES.caption}>{RITUAL_COPY.hint}</p>
      <button
        {...PRIMARY_ACTION_PROPS}
        type="button"
        disabled={ritual.phase !== "IDLE"}
        onClick={() => void (releaser ?? getReleaseCreation()).release({ kind: "pier" })}
        className={`${UI_CLASSES.primaryButton} w-full ${reducedMotion ? "" : "transition-colors "}md:w-auto`}
      >
        {RITUAL_COPY.releaseButton}
      </button>
      <p role="status" aria-live="polite" data-testid="ritual-status" className="min-h-6 text-body text-ink">
        {status}
      </p>
    </section>
  );
}
