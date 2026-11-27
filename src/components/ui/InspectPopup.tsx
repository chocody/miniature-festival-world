"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { LOY_KRATHONG_COPY } from "@/config/events/loyKrathong.copy";
import { KRATHONG_DESIGN_LABELS } from "@/config/customizer.config";
import { krathongDesignThumbnailUrl } from "@/config/krathongDesigns.config";
import { krathongDesignForAppearance } from "@/core/customization/krathongDesign";
import { DISPLAY_NAME_FALLBACK } from "@/config/wish.config";
import { getReportSession, type ReportSession } from "@/services/api/reportClient";
import type { InspectedCreation } from "./inspectedCreation";
import { UI_CLASSES, UI_GLYPHS } from "./uiClasses";
import { WishReportControl } from "./WishReportControl";
import { useEventCopy } from "./EventCopyContext";

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
 * chosen design's thumbnail (owner decision 29, MFW-63; MFW-81: no part list, a krathong without a design shows the default).
 * No id or time is ever shown.
 */
export function InspectPopup({ creation, onClose, reportSession, ownerSection }: InspectPopupProps) {
  const session = reportSession ?? getReportSession();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const eventCopy = useEventCopy();
  const copy = eventCopy.inspect;
  // Only the Loy entry has krathong thumbnails; other events render none until their ornament thumbnails exist (16.26/16.27).
  const showKrathongThumb = eventCopy === LOY_KRATHONG_COPY;
  const design = krathongDesignForAppearance(creation.appearance);
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
      {showKrathongThumb && (
        <span
          role="img"
          aria-label={KRATHONG_DESIGN_LABELS[design]}
          data-testid="inspect-design"
          data-design-id={design}
          className="mt-3 block size-12 rounded-field bg-cover bg-center"
          style={{ backgroundImage: `url(${krathongDesignThumbnailUrl(design)})` }}
        />
      )}
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
