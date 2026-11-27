"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { getReportSession, type ReportSession } from "@/services/api/reportClient";
import type { InspectedCreation } from "./inspectedCreation";
import { describeKrathongAppearance } from "./krathongAppearanceSummary";
import { UI_CLASSES, UI_GLYPHS } from "./uiClasses";
import { WishReportControl } from "./WishReportControl";

export interface InspectPopupProps {
  readonly creation: InspectedCreation;
  readonly onClose: () => void;
  /** Default getReportSession(). Injectable for tests. */
  readonly reportSession?: ReportSession;
  /** Owner-only block (MFW-31); the popup itself never touches the token. */
  readonly ownerSection?: ReactNode;
}

/**
 * Card for a tapped river krathong. An open wish shows name (or "ไม่ระบุชื่อ") + wish + Report; a closed wish shows only the
 * krathong's appearance (owner decision 29, MFW-63). No id or time is ever shown.
 */
export function InspectPopup({ creation, onClose, reportSession, ownerSection }: InspectPopupProps) {
  const session = reportSession ?? getReportSession();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const copy = INSPECT_POPUP_COPY;
  const rows = describeKrathongAppearance(creation.appearance);
  const isOpen = creation.publicWishText !== null;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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
      className={`mb-3 w-full ${UI_CLASSES.card} p-card text-body md:mb-0`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className={UI_CLASSES.title}>
          {copy.dialogTitle}
        </h2>
        <button type="button" onClick={onClose} aria-label={copy.close} className={UI_CLASSES.iconButton}>
          <span aria-hidden="true">{UI_GLYPHS.close}</span>
        </button>
      </div>
      <h3 className={`mt-3 ${UI_CLASSES.subheading}`}>{copy.appearanceHeading}</h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd>
              {row.swatch && (
                <span
                  aria-hidden="true"
                  className={`inline-block h-3 w-3 align-middle ${UI_CLASSES.swatch}`}
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
          <p className="mt-3" data-testid="inspect-display-name">
            <span className="text-ink-muted">{copy.fromLabel}</span> {creation.displayName ?? DISPLAY_NAME_FALLBACK}
          </p>
          <h3 className={`mt-3 ${UI_CLASSES.subheading}`}>{copy.wishHeading}</h3>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{creation.publicWishText}</p>
        </>
      )}
      {ownerSection}
      {isOpen && <WishReportControl creationId={creation.id} session={session} variant="text" />}
    </section>
  );
}
