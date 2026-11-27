"use client";

import { useEffect, useRef, useState } from "react";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import type { ReportSession } from "@/services/api/reportClient";
import { FlagIcon } from "./hudIcons";
import { UI_CLASSES } from "./uiClasses";

export interface WishReportControlProps {
  readonly creationId: string; // for the report request only; never displayed
  readonly session: ReportSession;
  /** "text": the InspectPopup block. "icon": a flag button while idle (the wish bubble). */
  readonly variant: "text" | "icon";
  /** Fires when the control enters / leaves confirming, sending or failed (not on mount). */
  readonly onActiveChange?: (active: boolean) => void;
}

type ReportUiState = "idle" | "confirming" | "sending" | "received" | "failed";

/** Report flow for one public wish (moved out of InspectPopup, MFW-80). The icon variant renders nothing when already reported at mount. */
export function WishReportControl({ creationId, session, variant, onActiveChange }: WishReportControlProps) {
  const [state, setState] = useState<ReportUiState>(() => (session.hasReported(creationId) ? "received" : "idle"));
  const [reportedAtMount] = useState(state === "received");
  const copy = INSPECT_POPUP_COPY;
  const active = state === "confirming" || state === "sending" || state === "failed";

  const lastActive = useRef(active);
  useEffect(() => {
    if (lastActive.current === active) return;
    lastActive.current = active;
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const send = () => {
    setState("sending");
    void session.submit(creationId).then((outcome) => setState(outcome === "received" ? "received" : "failed"));
  };

  if (variant === "icon" && reportedAtMount) return null;

  const statusText = state === "received" ? copy.reportReceived : state === "failed" ? copy.reportFailed : "";
  const rowClass = variant === "text" ? "mt-3 flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2";

  return (
    <div className={rowClass}>
      {state === "idle" &&
        (variant === "text" ? (
          <button type="button" className={UI_CLASSES.ghostButton} onClick={() => setState("confirming")}>
            {copy.report}
          </button>
        ) : (
          <button type="button" className={UI_CLASSES.iconButton} aria-label={copy.report} onClick={() => setState("confirming")}>
            <FlagIcon />
          </button>
        ))}
      {state === "confirming" && (
        <>
          <p className="w-full">{copy.reportPrompt}</p>
          <button type="button" className={UI_CLASSES.secondaryButton} onClick={send}>
            {copy.reportConfirm}
          </button>
          <button type="button" className={UI_CLASSES.ghostButton} onClick={() => setState("idle")}>
            {copy.reportCancel}
          </button>
        </>
      )}
      {state === "sending" && (
        <button type="button" className={UI_CLASSES.ghostButton} disabled>
          {copy.reportSending}
        </button>
      )}
      {state === "failed" && (
        <button type="button" className={UI_CLASSES.ghostButton} onClick={send}>
          {copy.reportRetry}
        </button>
      )}
      <p aria-live="polite" className={`w-full ${UI_CLASSES.caption}`}>
        {statusText}
      </p>
    </div>
  );
}
