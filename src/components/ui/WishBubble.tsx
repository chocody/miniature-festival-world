"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { WISH_BUBBLE_ANNOUNCE_DELAY_MS, WISH_BUBBLE_COPY, WISH_BUBBLE_TIMING } from "@/config/inspect.config";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { getReportSession, type ReportSession } from "@/services/api/reportClient";
import type { InspectedCreation } from "./inspectedCreation";
import { UI_CLASSES } from "./uiClasses";
import { WishReportControl } from "./WishReportControl";

export interface WishBubbleProps {
  readonly creation: InspectedCreation;
  readonly reducedMotion: boolean;
  /** The outer element: WishBubbleAnchor (in the canvas) writes its transform and visibility every frame. */
  readonly bubbleRef: RefObject<HTMLDivElement | null>;
  /** Called once when the bubble is gone (after the fade, or right after the visible time under reduced motion). */
  readonly onDone: () => void;
  /** Default getReportSession(). Injectable for tests. */
  readonly reportSession?: ReportSession;
}

/** Module-level so React never re-sets the style the anchor writes (transform, visibility). */
const OUTER_STYLE: CSSProperties = { visibility: "hidden" };

/**
 * Speech bubble with another person's public wish, floating above their krathong (MFW-80). Data comes only from InspectedCreation
 * (invariant C); the id goes only to the report control. Fades with setTimeout (no frame loop); reduced motion skips the fade.
 * While the report control is open the bubble stays; when it closes the lifetime restarts.
 */
export function WishBubble({ creation, reducedMotion, bubbleRef, onDone, reportSession }: WishBubbleProps) {
  const session = reportSession ?? getReportSession();
  const [phase, setPhase] = useState<"shown" | "fading">("shown");
  const [reportActive, setReportActive] = useState(false);
  const [engaged, setEngaged] = useState(false); // focus or a pointer is inside the bubble: the lifetime pauses
  const [textReady, setTextReady] = useState(false);
  const paused = reportActive || engaged;
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setTextReady(true), WISH_BUBBLE_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (paused) return;
    const { visibleMs, fadeMs } = WISH_BUBBLE_TIMING;
    if (reducedMotion) {
      const done = setTimeout(() => onDoneRef.current(), visibleMs);
      return () => clearTimeout(done);
    }
    const fade = setTimeout(() => setPhase("fading"), visibleMs);
    const done = setTimeout(() => onDoneRef.current(), visibleMs + fadeMs);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [paused, reducedMotion]);

  const onReportActiveChange = useCallback((active: boolean) => {
    setReportActive(active);
    if (active) setPhase("shown");
  }, []);

  const engage = useCallback(() => {
    setEngaged(true);
    setPhase("shown");
  }, []);

  const fading = phase === "fading" && !reducedMotion;
  return (
    <div ref={bubbleRef} role="status" className="pointer-events-none fixed top-0 left-0 z-10" style={OUTER_STYLE}>
      <div
        data-testid="wish-bubble"
        role="group"
        aria-label={WISH_BUBBLE_COPY.label}
        data-wish-bubble-phase={fading ? "fading" : "shown"}
        data-motion={reducedMotion ? "reduced" : "full"}
        className={`${fading ? "pointer-events-none" : "pointer-events-auto"} relative -translate-x-1/2 -translate-y-full ${UI_CLASSES.card} p-3 max-w-[min(16rem,calc(100vw-2*var(--spacing-gutter)))]${fading ? " transition-opacity opacity-0" : ""}`}
        onPointerEnter={engage}
        onPointerLeave={() => setEngaged(false)}
        onFocus={engage}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setEngaged(false);
        }}
        style={fading ? { transitionDuration: `${WISH_BUBBLE_TIMING.fadeMs}ms` } : undefined}
      >
        <p className="max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words">
          {textReady ? creation.publicWishText : null}
        </p>
        <p className={UI_CLASSES.caption}>{creation.displayName ?? DISPLAY_NAME_FALLBACK}</p>
        <WishReportControl creationId={creation.id} session={session} variant="icon" onActiveChange={onReportActiveChange} />
        <span aria-hidden="true" className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-paper" />
      </div>
    </div>
  );
}
