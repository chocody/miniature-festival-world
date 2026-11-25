"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { getReportSession, type ReportSession } from "@/services/api/reportClient";
import type { InspectedCreation } from "./inspectedCreation";
import { describeKrathongAppearance } from "./krathongAppearanceSummary";

export interface InspectPopupProps {
  readonly creation: InspectedCreation;
  readonly onClose: () => void;
  /** Default getReportSession(). Injectable for tests. */
  readonly reportSession?: ReportSession;
  /** Owner-only block (MFW-31); the popup itself never touches the token. */
  readonly ownerSection?: ReactNode;
}

type ReportUiState = "idle" | "confirming" | "sending" | "received" | "failed";

const BUTTON_CLASS = "min-h-11 min-w-11 rounded-full border border-current px-3";

/**
 * Card for a tapped river krathong. An open wish shows name (or "ไม่ระบุชื่อ") + wish + Report; a closed wish shows only the
 * krathong's appearance (owner decision 29, MFW-63). No id or time is ever shown.
 */
export function InspectPopup({ creation, onClose, reportSession, ownerSection }: InspectPopupProps) {
  const session = reportSession ?? getReportSession();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<ReportUiState>(() => (session.hasReported(creation.id) ? "received" : "idle"));
  const copy = INSPECT_POPUP_COPY;
  const rows = describeKrathongAppearance(creation.appearance);
  const isOpen = creation.publicWishText !== null;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const send = () => {
    setState("sending");
    void session.submit(creation.id).then((outcome) => setState(outcome === "received" ? "received" : "failed"));
  };

  const statusText = state === "received" ? copy.reportReceived : state === "failed" ? copy.reportFailed : "";

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="mb-8 w-full rounded-2xl border border-indigo-950/20 bg-white px-4 py-3 text-sm text-zinc-900 shadow-lg dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-base font-semibold">
          {copy.dialogTitle}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full px-3">
          {copy.close}
        </button>
      </div>
      <h3 className="mt-2 font-semibold">{copy.appearanceHeading}</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.key} className="flex gap-2">
            <dt className="opacity-75">{row.label}</dt>
            <dd>
              {row.swatch && (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full border border-black/20 align-middle"
                  style={{ backgroundColor: row.swatch }}
                />
              )}{" "}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {isOpen && (
        <>
          <p className="mt-2" data-testid="inspect-display-name">
            <span className="opacity-75">{copy.fromLabel}</span> {creation.displayName ?? DISPLAY_NAME_FALLBACK}
          </p>
          <h3 className="mt-2 font-semibold">{copy.wishHeading}</h3>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{creation.publicWishText}</p>
        </>
      )}
      {ownerSection}
      {isOpen && (
        <div className="mt-2">
          {state === "idle" && (
            <button type="button" className={BUTTON_CLASS} onClick={() => setState("confirming")}>
              {copy.report}
            </button>
          )}
          {state === "confirming" && (
            <>
              <p>{copy.reportPrompt}</p>
              <button type="button" className={BUTTON_CLASS} onClick={send}>
                {copy.reportConfirm}
              </button>{" "}
              <button type="button" className={BUTTON_CLASS} onClick={() => setState("idle")}>
                {copy.reportCancel}
              </button>
            </>
          )}
          {state === "sending" && (
            <button type="button" className={BUTTON_CLASS} disabled>
              {copy.reportSending}
            </button>
          )}
          {state === "failed" && (
            <button type="button" className={BUTTON_CLASS} onClick={send}>
              {copy.reportRetry}
            </button>
          )}
          <p aria-live="polite">{statusText}</p>
        </div>
      )}
    </section>
  );
}
