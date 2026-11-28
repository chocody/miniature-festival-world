"use client";

import type { FestivalEventId } from "@/config/events";
import { getInteractionMode, type CustomizeViewControl } from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { isRitualBumped } from "@/core/ritual";
import { getReleaseCreation } from "@/services/api/releaseCreation";
import { getZonePagination } from "@/services/api/zonePagination";
import { installMyCreationsRecorder } from "@/services/auth/myCreationsVault";
import { lazy, Suspense, useEffect, useRef } from "react";
import { CustomizerPanel } from "./CustomizerPanel";
import { EventCopyProvider } from "./EventCopyContext";
import { DayNightSwitch } from "./DayNightSwitch";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";
import { MyCreationsDrawer } from "./MyCreationsDrawer";
import { NoWebglNotice } from "./NoWebglNotice";
import { RitualReleasePanel } from "./RitualReleasePanel";
import { OverlaySlot, STAGE_LAYOUT_CLASSES } from "./StageLayout";
import { WishModal } from "./WishModal";
import { SkyLaunchSwitch } from "./SkyLaunchSwitch";
import { StartCreateButton } from "./StartCreateButton";
import { WorldRotateButton } from "./WorldRotateButton";
import { ZoneNavigator } from "./ZoneNavigator";

/** three / R3F / react-spring live only in this async chunk, fetched once a 3D tier and a canvas mode are known (MFW-44). */
const SceneViewport = lazy(() =>
  import("@/components/canvas3d").then((m) => ({ default: m.SceneViewport })),
);

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
  const requestViewRotate = useUIStore((s) => s.requestViewRotate);
  const enterActiveEvent = useUIStore((s) => s.enterActiveEvent);
  const enteredEventId = useUIStore((s) => s.selectedEventId);
  const ritual = useUIStore((s) => s.ritual);
  const ritualPhase = ritual.phase;
  const viewControlRef = useRef<CustomizeViewControl | null>(null);
  const webglAvailable = useDeviceStore((s) => s.webglAvailable);
  const show3D = profiled && webglAvailable;
  // MFW-71: the stage shows a notice; MFW-154: the flow overlays (start button, customizer, wish, ritual) still work over it.
  const noScene = profiled && !webglAvailable;
  const interactionMode = getInteractionMode(flowState);

  // Binds the server-resolved event to the session (MFW-53); declared first so later effects see it.
  useEffect(() => enterActiveEvent(eventId), [enterActiveEvent, eventId]);

  // Every saved release is recorded in this device's creation list (MFW-30; owner decision 12).
  useEffect(() => installMyCreationsRecorder(getReleaseCreation()), []);

  // The ritual finishes only after the release settled (or completed instantly without a scene).
  useEffect(() => {
    if (flowState === "RITUAL_RELEASE" && ritualPhase === "RELEASED") dispatch({ type: "FINISH_RITUAL" });
  }, [flowState, ritualPhase, dispatch]);

  // MFW-154: the world loads on landing and stays loaded while customizing (the hero view keeps the stretch the visitor
  // was on); it is left in WRITE_WISH (the scene is unmounted there) so the ritual enters a fresh world exactly as before,
  // and it is not re-entered on FINISH_RITUAL.
  const inWorld = flowState !== "WRITE_WISH";
  useEffect(() => {
    if (!inWorld) return;
    const pagination = getZonePagination();
    void pagination.enterWorld(eventId);
    return () => pagination.leaveWorld();
  }, [inWorld, eventId]);

  // MFW-154 focus management: the customizer panel takes focus after START_CREATE, the start button after CANCEL_CREATE.
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<"customizer" | "start" | null>(null);
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null) return;
    pendingFocusRef.current = null;
    const selector = target === "customizer" ? '[data-testid="customizer-panel"]' : '[data-testid="start-create"]';
    overlayRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }, [flowState]);
  const startCreate = () => {
    pendingFocusRef.current = "customizer";
    dispatch({ type: "START_CREATE" });
  };
  const cancelCreate = () => {
    pendingFocusRef.current = "start";
    dispatch({ type: "CANCEL_CREATE" });
  };

  const hud = (
    <>
      {/* HUD column top-left (MFW-74): Find My, day/night toggle, rotate, sky launch switch (3D world view only). */}
      {interactionMode !== null && (
        <OverlaySlot slot="corner">
          {flowState === "SHARED_WORLD_EXPLORE" && <MyCreationsDrawer />}
          <DayNightSwitch />
          {flowState === "SHARED_WORLD_EXPLORE" && show3D && <WorldRotateButton onRotate={requestViewRotate} />}
          {flowState === "SHARED_WORLD_EXPLORE" && show3D && <SkyLaunchSwitch />}
        </OverlaySlot>
      )}
      {flowState === "SHARED_WORLD_EXPLORE" && (
        <OverlaySlot slot="top">
          <ZoneNavigator />
        </OverlaySlot>
      )}
    </>
  );

  const flowOverlays =
    flowState === "CUSTOMIZE_OBJECT" ? (
      <CustomizerPanel
        eventId={eventId}
        onDone={() => dispatch({ type: "FINISH_CUSTOMIZE" })}
        onCancel={cancelCreate}
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
        {/* MFW-154 landing: the world hint would be wrong without a scene, so no WebGL shows only the button. */}
        {noScene ? (
          <StartCreateButton onPress={startCreate} />
        ) : (
          <FlowStepPlaceholder step={flowState} action={<StartCreateButton onPress={startCreate} />} />
        )}
      </OverlaySlot>
    );

  return (
    <EventCopyProvider eventId={eventId}>
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
                startFramedOnPier={flowState === "SHARED_WORLD_EXPLORE"}
                viewControlRef={viewControlRef}
                onReleaseDrop={
                  interactionMode === "RITUAL_RELEASE"
                    ? (candidate) => void getReleaseCreation().release({ kind: "drop", candidate })
                    : undefined
                }
              />
            </Suspense>
          )}
          {noScene && <NoWebglNotice />}
        </div>
        <div ref={overlayRef} data-testid="overlay-layer" className={STAGE_LAYOUT_CLASSES.overlay}>
          {/* Without WebGL the flow works over the notice; the HUD stays hidden (nothing to navigate). */}
          {profiled && (noScene ? flowOverlays : <>{hud}{flowOverlays}</>)}
        </div>
      </div>
    </EventCopyProvider>
  );
}
