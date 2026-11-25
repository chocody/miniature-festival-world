"use client";

import type { FestivalEventId } from "@/config/events";
import type { FlowEvent, FlowState } from "@/core/flow";
import { getInteractionMode, type CustomizeViewControl } from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { isRitualBumped } from "@/core/ritual";
import { getReleaseCreation } from "@/services/api/releaseCreation";
import { getZonePagination } from "@/services/api/zonePagination";
import { installMyCreationsRecorder } from "@/services/auth/myCreationsVault";
import { lazy, Suspense, useEffect, useRef } from "react";
import { CustomizerPanel } from "./CustomizerPanel";
import { DayNightSwitch } from "./DayNightSwitch";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";
import { MyCreationsDrawer } from "./MyCreationsDrawer";
import { OwnerWishControls } from "./OwnerWishControls";
import { RitualReleasePanel } from "./RitualReleasePanel";
import { OverlaySlot, STAGE_LAYOUT_CLASSES } from "./StageLayout";
import { WishModal } from "./WishModal";
import { ZoneNavigator } from "./ZoneNavigator";

/** three / R3F / react-spring live only in this async chunk, fetched once a 3D tier and a canvas mode are known (MFW-44). */
const SceneViewport = lazy(() =>
  import("@/components/canvas3d").then((m) => ({ default: m.SceneViewport })),
);

/** The 2D fallback is its own async chunk, three-free (MFW-33). */
const FlatViewport = lazy(() =>
  import("@/components/canvas2d").then((m) => ({ default: m.FlatViewport })),
);

/** Event that advances each placeholder step; the terminal step has none. */
const NEXT_EVENT: Partial<Record<FlowState, FlowEvent>> = {
  CUSTOMIZE_OBJECT: { type: "FINISH_CUSTOMIZE" },
};

/** Renders the current step of the user flow from useUIStore. */
export interface FlowRootProps {
  readonly eventId: FestivalEventId;
}

export function FlowRoot({ eventId }: FlowRootProps) {
  const flowState = useUIStore((s) => s.flowState);
  const dispatch = useUIStore((s) => s.dispatch);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const profiled = useDeviceStore((s) => s.profiled);
  const enterActiveEvent = useUIStore((s) => s.enterActiveEvent);
  const enteredEventId = useUIStore((s) => s.selectedEventId);
  const ritual = useUIStore((s) => s.ritual);
  const ritualPhase = ritual.phase;
  const viewControlRef = useRef<CustomizeViewControl | null>(null);
  const show3D = profiled && qualityTier !== "FALLBACK_2D";
  const show2D = profiled && qualityTier === "FALLBACK_2D";
  const nextEvent = NEXT_EVENT[flowState];
  const interactionMode = getInteractionMode(flowState);

  // Binds the server-resolved event to the session (MFW-53); declared first so later effects see it.
  useEffect(() => enterActiveEvent(eventId), [enterActiveEvent, eventId]);

  // Every saved release is recorded in this device's creation list (MFW-30; owner decision 12).
  useEffect(() => installMyCreationsRecorder(getReleaseCreation()), []);

  // The ritual finishes only after the release settled (or completed instantly without a scene).
  useEffect(() => {
    if (flowState === "RITUAL_RELEASE" && ritualPhase === "RELEASED") dispatch({ type: "FINISH_RITUAL" });
  }, [flowState, ritualPhase, dispatch]);

  // The world loads once when the ritual starts and is not re-entered on FINISH_RITUAL.
  const inWorld = flowState === "RITUAL_RELEASE" || flowState === "SHARED_WORLD_EXPLORE";
  useEffect(() => {
    if (!inWorld) return;
    const pagination = getZonePagination();
    void pagination.enterWorld(eventId);
    return () => pagination.leaveWorld();
  }, [inWorld, eventId]);

  return (
    <div
      data-flow-state={flowState}
      data-active-event={enteredEventId ?? undefined}
      data-quality-tier={qualityTier}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-interaction-mode={interactionMode ?? undefined}
      data-ritual-phase={ritualPhase}
      data-ritual-bumped={ritual.saved ? String(isRitualBumped(ritual)) : undefined}
      data-own-krathong={ritualPhase === "RELEASED" ? "released" : undefined}
      data-ritual-error={ritual.error?.kind ?? undefined}
      data-stage-layout="fullscreen"
      className={STAGE_LAYOUT_CLASSES.root}
    >
      <div data-testid="stage-layer" className={STAGE_LAYOUT_CLASSES.stage}>
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
        {show2D && interactionMode !== null && (
          <Suspense fallback={null}>
            <FlatViewport mode={interactionMode} />
          </Suspense>
        )}
      </div>
      <div data-testid="overlay-layer" className={STAGE_LAYOUT_CLASSES.overlay}>
        {/* Day/night switch (MFW-47): in the world view it heads the top card; in the other canvas modes the top-left corner is free. */}
        {interactionMode !== null && flowState !== "SHARED_WORLD_EXPLORE" && (
          <OverlaySlot slot="corner">
            <DayNightSwitch />
          </OverlaySlot>
        )}
        {flowState === "SHARED_WORLD_EXPLORE" && (
          <OverlaySlot slot="top">
            <DayNightSwitch />
            <ZoneNavigator />
            <MyCreationsDrawer renderEntryExtra={(entry) => <OwnerWishControls creationId={entry.id} zone={entry} />} />
          </OverlaySlot>
        )}
        {flowState === "CUSTOMIZE_OBJECT" ? (
          <CustomizerPanel
            eventId={eventId}
            onDone={() => dispatch({ type: "FINISH_CUSTOMIZE" })}
            viewControlRef={show3D ? viewControlRef : null}
          />
        ) : flowState === "WRITE_WISH" ? (
          <OverlaySlot slot="dialog">
            <WishModal onSubmitted={() => dispatch({ type: "SUBMIT_WISH" })} />
          </OverlaySlot>
        ) : flowState === "RITUAL_RELEASE" ? (
          <OverlaySlot slot="panel">
            <RitualReleasePanel animateInScene={show3D} />
          </OverlaySlot>
        ) : (
          <OverlaySlot slot="panel">
            <FlowStepPlaceholder step={flowState} onNext={nextEvent ? () => dispatch(nextEvent) : undefined} />
          </OverlaySlot>
        )}
      </div>
    </div>
  );
}
