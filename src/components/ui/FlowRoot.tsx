"use client";

import type { FlowEvent, FlowState } from "@/core/flow";
import { getInteractionMode } from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { lazy, Suspense } from "react";
import { EventSelector } from "./EventSelector";
import { FlowStepPlaceholder } from "./FlowStepPlaceholder";
import { OwnershipNotice } from "./OwnershipNotice";

/** three / R3F / react-spring live only in this async chunk, fetched once a 3D tier and a canvas mode are known (MFW-44). */
const SceneViewport = lazy(() =>
  import("@/components/canvas3d").then((m) => ({ default: m.SceneViewport })),
);

/** Event that advances each placeholder step; LANDING and the terminal step have none. */
const NEXT_EVENT: Partial<Record<FlowState, FlowEvent>> = {
  CUSTOMIZE_OBJECT: { type: "FINISH_CUSTOMIZE" },
  WRITE_WISH: { type: "SUBMIT_WISH" },
  RITUAL_RELEASE: { type: "FINISH_RITUAL" },
};

/** Renders the current step of the user flow from useUIStore. */
export function FlowRoot() {
  const flowState = useUIStore((s) => s.flowState);
  const dispatch = useUIStore((s) => s.dispatch);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const profiled = useDeviceStore((s) => s.profiled);
  const nextEvent = NEXT_EVENT[flowState];
  const interactionMode = getInteractionMode(flowState);

  return (
    <div
      data-flow-state={flowState}
      data-quality-tier={qualityTier}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-interaction-mode={interactionMode ?? undefined}
      className="flex w-full flex-col"
    >
      {profiled && qualityTier !== "FALLBACK_2D" && interactionMode !== null && (
        <Suspense fallback={null}>
          <SceneViewport
            mode={interactionMode}
            onGestureRelease={interactionMode === "RITUAL_RELEASE" ? () => dispatch({ type: "FINISH_RITUAL" }) : undefined}
          />
        </Suspense>
      )}
      {flowState === "WRITE_WISH" && <OwnershipNotice />}
      {flowState === "LANDING_EVENT_SELECT" ? (
        <EventSelector onSelect={(eventId) => dispatch({ type: "SELECT_EVENT", eventId })} />
      ) : (
        <FlowStepPlaceholder
          step={flowState}
          nextLabel={flowState === "RITUAL_RELEASE" ? "ปล่อยกระทง" : undefined}
          onNext={nextEvent ? () => dispatch(nextEvent) : undefined}
        />
      )}
    </div>
  );
}
