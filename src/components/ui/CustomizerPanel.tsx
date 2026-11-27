"use client";

import type { RefObject } from "react";
import type { FestivalEventId } from "@/config/events";
import { CUSTOMIZER_COPY, KRATHONG_DESIGN_LABELS } from "@/config/customizer.config";
import { KRATHONG_DESIGN_IDS, krathongDesignThumbnailUrl } from "@/config/krathongDesigns.config";
import { DEFAULT_KRATHONG_APPEARANCE, krathongDesignForAppearance, type KrathongChoice } from "@/core/customization";
import type { CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";
import { STAGE_LAYOUT_CLASSES } from "./StageLayout";
import { PRIMARY_ACTION_PROPS, UI_CLASSES } from "./uiClasses";

export interface CustomizerPanelProps {
  eventId: FestivalEventId | null;
  /** Dispatches FINISH_CUSTOMIZE. */
  onDone: () => void;
  /** null = no 3D view mounted (not profiled): rotate/zoom buttons and the gesture hint are hidden. */
  viewControlRef: RefObject<CustomizeViewControl | null> | null;
}

/**
 * MFW-78 design tiles: thumbnail only, no text (owner: minimal UI). Tokens only. Tile = 48 px thumbnail + 2 × (2 px padding +
 * 2 px border) = 56 px; five tiles and four 8 px gaps (312 px) fit the 312 px content width of the floating bar at 360 px (336 px bar, 12 px padding).
 */
const DESIGN_TILE_CLASSES = Object.freeze({
  base: "min-h-11 min-w-11 shrink-0 rounded-card border-2 p-0.5 transition-colors motion-reduce:transition-none",
  on: "border-clay bg-clay-soft",
  off: "border-line bg-paper hover:bg-clay-soft",
});

function ViewButton({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={UI_CLASSES.iconButton}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/**
 * Floating bottom-bar customizer (backlog 4.2, MFW-83: centred, a gutter above the bottom edge, not a full-width sheet): one row of the five krathong design thumbnails (MFW-78, replaces the part tabs),
 * rotate/zoom buttons, "ถัดไป".
 */
export function CustomizerPanel({ eventId, onDone, viewControlRef }: CustomizerPanelProps) {
  const stored = useBuilderStore((s) => s.appearance);
  const chooseKrathong = useBuilderStore((s) => s.chooseKrathong);
  const chosenDesign = krathongDesignForAppearance(stored ?? DEFAULT_KRATHONG_APPEARANCE);

  // The result is ignored on purpose: the tiles only offer catalogue values, so a failure is unreachable.
  const choose = (choice: KrathongChoice) => {
    chooseKrathong(choice);
  };

  return (
    <section
      aria-label={CUSTOMIZER_COPY.panelLabel}
      data-testid="customizer-panel"
      className={`${STAGE_LAYOUT_CLASSES.floatBar} touch-manipulation`}
    >
      {viewControlRef && <p className={UI_CLASSES.caption}>{CUSTOMIZER_COPY.gestureHint}</p>}
      {eventId === "loy_krathong" && (
        <div role="group" aria-label={CUSTOMIZER_COPY.designGroupLabel} className="flex justify-center gap-2">
          {KRATHONG_DESIGN_IDS.map((id) => {
            const pressed = chosenDesign === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={KRATHONG_DESIGN_LABELS[id]}
                aria-pressed={pressed}
                data-design-id={id}
                onClick={() => choose({ part: "design", value: id })}
                className={`${DESIGN_TILE_CLASSES.base} ${pressed ? DESIGN_TILE_CLASSES.on : DESIGN_TILE_CLASSES.off}`}
              >
                <span
                  aria-hidden="true"
                  className="block size-12 rounded-field bg-cover bg-center"
                  style={{ backgroundImage: `url(${krathongDesignThumbnailUrl(id)})` }}
                />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        {viewControlRef && (
          <div role="group" aria-label={CUSTOMIZER_COPY.viewGroupLabel} className="flex gap-1">
            <ViewButton label={CUSTOMIZER_COPY.rotateLeft} glyph="⟲" onPress={() => viewControlRef.current?.rotate(-1)} />
            <ViewButton label={CUSTOMIZER_COPY.rotateRight} glyph="⟳" onPress={() => viewControlRef.current?.rotate(1)} />
            <ViewButton label={CUSTOMIZER_COPY.zoomIn} glyph="+" onPress={() => viewControlRef.current?.zoom(1)} />
            <ViewButton label={CUSTOMIZER_COPY.zoomOut} glyph="−" onPress={() => viewControlRef.current?.zoom(-1)} />
          </div>
        )}
        <button
          {...PRIMARY_ACTION_PROPS}
          type="button"
          onClick={onDone}
          className={`${UI_CLASSES.primaryButton} ml-auto transition-colors motion-reduce:transition-none`}
        >
          {CUSTOMIZER_COPY.done}
        </button>
      </div>
    </section>
  );
}
