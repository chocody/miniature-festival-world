"use client";

import type { FlowEvent, FlowState } from "@/core/flow";
import { getInteractionMode, type CustomizeViewControl } from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { isRitualBumped } from "@/core/ritual";
import { getReleaseCreation } from "@/services/api/releaseCreation";
import { getZonePagination } from "@/services/api/zonePagination";
import { lazy, Suspense, useEffect, useRef } from "react";
import { CustomizerPanel } from "./CustomizerPanel";
import { EventSelector } from "./EventSelector";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";
import { RitualReleasePanel } from "./RitualReleasePanel";
import { WishModal } from "./WishModal";
import { ZoneNavigator } from "./ZoneNavigator";

/** three / R3F / react-spring live only in this async chunk, fetched once a 3D tier and a canvas mode are known (MFW-44). */
const SceneViewport = lazy(() =>
  import("@/components/canvas3d").then((m) => ({ default: m.SceneViewport })),
);

/** Event that advances each placeholder step; LANDING and the terminal step have none. */
const NEXT_EVENT: Partial<Record<FlowState, FlowEvent>> = {
  CUSTOMIZE_OBJECT: { type: "FINISH_CUSTOMIZE" },
};

/** Renders the current step of the user flow from useUIStore. */
export function FlowRoot() {
  const flowState = useUIStore((s) => s.flowState);
  const dispatch = useUIStore((s) => s.dispatch);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const profiled = useDeviceStore((s) => s.profiled);
  const selectedEventId = useUIStore((s) => s.selectedEventId);
  const ritual = useUIStore((s) => s.ritual);
  const ritualPhase = ritual.phase;
  const viewControlRef = useRef<CustomizeViewControl | null>(null);
  const show3D = profiled && qualityTier !== "FALLBACK_2D";
  const nextEvent = NEXT_EVENT[flowState];
  const interactionMode = getInteractionMode(flowState);

  // The ritual finishes only after the release settled (or completed instantly without a scene).
  useEffect(() => {
    if (flowState === "RITUAL_RELEASE" && ritualPhase === "RELEASED") dispatch({ type: "FINISH_RITUAL" });
  }, [flowState, ritualPhase, dispatch]);

  // The world loads once when the ritual starts and is not re-entered on FINISH_RITUAL.
  const inWorld = flowState === "RITUAL_RELEASE" || flowState === "SHARED_WORLD_EXPLORE";
  useEffect(() => {
    if (!inWorld || selectedEventId === null) return;
    const pagination = getZonePagination();
    void pagination.enterWorld(selectedEventId);
    return () => pagination.leaveWorld();
  }, [inWorld, selectedEventId]);

  return (
    <div
      data-flow-state={flowState}
      data-quality-tier={qualityTier}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-interaction-mode={interactionMode ?? undefined}
      data-ritual-phase={ritualPhase}
      data-ritual-bumped={ritual.saved ? String(isRitualBumped(ritual)) : undefined}
      data-own-krathong={ritualPhase === "RELEASED" ? "released" : undefined}
      data-ritual-error={ritual.error?.kind ?? undefined}
      className="flex w-full flex-col"
    >
      {show3D && interactionMode !== null && (
        <Suspense fallback={null}>
          <SceneViewport
            mode={interactionMode}
            viewControlRef={viewControlRef}
            onReleaseDrop={
              interactionMode === "RITUAL_RELEASE"
                ? (candidate) => void getReleaseCreation().release({ kind: "drop", candidate })
                : undefined
            }
          />
        </Suspense>
      )}
      {flowState === "SHARED_WORLD_EXPLORE" && <ZoneNavigator />}
      {flowState === "LANDING_EVENT_SELECT" ? (
        <EventSelector onSelect={(eventId) => dispatch({ type: "SELECT_EVENT", eventId })} />
      ) : flowState === "CUSTOMIZE_OBJECT" ? (
        <CustomizerPanel
          eventId={selectedEventId}
          onDone={() => dispatch({ type: "FINISH_CUSTOMIZE" })}
          viewControlRef={show3D ? viewControlRef : null}
        />
      ) : flowState === "WRITE_WISH" ? (
        <WishModal onSubmitted={() => dispatch({ type: "SUBMIT_WISH" })} />
      ) : flowState === "RITUAL_RELEASE" ? (
        <RitualReleasePanel animateInScene={show3D} />
      ) : (
        <FlowStepPlaceholder step={flowState} onNext={nextEvent ? () => dispatch(nextEvent) : undefined} />
      )}
    </div>
  );
}
