"use client";

import { useId, useState, type ReactNode, type RefObject } from "react";
import type { FestivalEventId } from "@/config/events";
import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
import {
  CANDLE_COLOR_LABELS,
  CUSTOMIZER_COPY,
  CUSTOMIZER_TABS,
  FLOWER_KIND_LABELS,
  KRATHONG_BASE_LABELS,
  LEAF_COLOR_LABELS,
  LEAF_FOLD_STYLE_LABELS,
  NO_FLOWER_LABEL,
  type CustomizerTabId,
} from "@/config/customizer.config";
import {
  ALL_RIM_SOCKETS,
  DEFAULT_KRATHONG_APPEARANCE,
  getFlowerSelection,
  type KrathongChoice,
} from "@/core/customization";
import type { CustomizeViewControl } from "@/core/interaction";
import { useBuilderStore } from "@/store/useBuilderStore";
import { STAGE_LAYOUT_CLASSES } from "./StageLayout";
import { PRIMARY_ACTION_PROPS, UI_CLASSES } from "./uiClasses";

export interface CustomizerPanelProps {
  eventId: FestivalEventId | null;
  /** Dispatches FINISH_CUSTOMIZE. */
  onDone: () => void;
  /** null = no 3D view mounted (FALLBACK_2D / not profiled): rotate/zoom buttons and the gesture hint are hidden. */
  viewControlRef: RefObject<CustomizeViewControl | null> | null;
}

function OptionButton({
  label,
  pressed,
  onPress,
  swatch,
}: {
  label: string;
  pressed: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`${UI_CLASSES.chip} transition-colors motion-reduce:transition-none ${
        pressed ? UI_CLASSES.chipOn : UI_CLASSES.chipOff
      }`}
    >
      {swatch && (
        <span
          aria-hidden="true"
          className={`h-5 w-5 ${UI_CLASSES.swatch}`}
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </button>
  );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
}

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

/** Bottom-bar customizer (backlog 4.2): part and colour buttons, rotate/zoom buttons, "ถัดไป". */
export function CustomizerPanel({ eventId, onDone, viewControlRef }: CustomizerPanelProps) {
  const idBase = useId();
  const [tab, setTab] = useState<CustomizerTabId>(CUSTOMIZER_TABS[0].id);
  const stored = useBuilderStore((s) => s.appearance);
  const chooseKrathong = useBuilderStore((s) => s.chooseKrathong);
  const appearance = stored ?? DEFAULT_KRATHONG_APPEARANCE;

  // The result is ignored on purpose: the buttons only offer catalogue values, so a failure is unreachable.
  const choose = (choice: KrathongChoice) => {
    chooseKrathong(choice);
  };
  const flowerSelection = getFlowerSelection(appearance, ALL_RIM_SOCKETS);
  const tabId = (id: CustomizerTabId) => `${idBase}-tab-${id}`;
  const panelId = `${idBase}-tabpanel`;

  return (
    <section
      aria-label={CUSTOMIZER_COPY.panelLabel}
      data-testid="customizer-panel"
      className={`${STAGE_LAYOUT_CLASSES.panel} flex flex-col gap-3 touch-manipulation`}
    >
      {viewControlRef && <p className={UI_CLASSES.caption}>{CUSTOMIZER_COPY.gestureHint}</p>}
      {eventId === "loy_krathong" && (
        <>
          <div role="tablist" aria-label={CUSTOMIZER_COPY.tabListLabel} className="grid grid-cols-4 gap-1 rounded-full bg-ink/5 p-1">
            {CUSTOMIZER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabId(t.id)}
                aria-selected={tab === t.id}
                aria-controls={panelId}
                data-tab-id={t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 min-w-11 rounded-full text-body ${tab === t.id ? "bg-paper font-semibold text-ink shadow-raised" : "font-medium text-ink hover:bg-paper/60"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="flex min-h-26 flex-col gap-2">
            {tab === "base" && (
              <OptionRow label={CUSTOMIZER_COPY.baseGroupLabel}>
                {KRATHONG_BASE_IDS.map((id) => (
                  <OptionButton
                    key={id}
                    label={KRATHONG_BASE_LABELS[id]}
                    swatch={KRATHONG_BASE_MODELS[id].color}
                    pressed={appearance.base === id}
                    onPress={() => choose({ part: "base", value: id })}
                  />
                ))}
              </OptionRow>
            )}
            {tab === "leaves" && (
              <>
                <OptionRow label={CUSTOMIZER_COPY.foldGroupLabel}>
                  {LEAF_FOLD_STYLE_IDS.map((id) => (
                    <OptionButton
                      key={id}
                      label={LEAF_FOLD_STYLE_LABELS[id]}
                      pressed={appearance.lotusFold === id}
                      onPress={() => choose({ part: "lotusFold", value: id })}
                    />
                  ))}
                </OptionRow>
                <OptionRow label={CUSTOMIZER_COPY.leafColorGroupLabel}>
                  {LEAF_COLOR_PALETTE.map((c) => (
                    <OptionButton
                      key={c}
                      label={LEAF_COLOR_LABELS[c]}
                      swatch={c}
                      pressed={appearance.leafColor === c}
                      onPress={() => choose({ part: "leafColor", value: c })}
                    />
                  ))}
                </OptionRow>
              </>
            )}
            {tab === "flowers" && (
              <OptionRow label={CUSTOMIZER_COPY.flowerGroupLabel}>
                {FLOWER_KINDS.map((kind) => (
                  <OptionButton
                    key={kind}
                    label={FLOWER_KIND_LABELS[kind]}
                    swatch={KRATHONG_FLOWER_MODELS[kind].color}
                    pressed={flowerSelection === kind}
                    onPress={() => choose({ part: "flower", target: ALL_RIM_SOCKETS, value: kind })}
                  />
                ))}
                <OptionButton
                  label={NO_FLOWER_LABEL}
                  pressed={flowerSelection === null}
                  onPress={() => choose({ part: "flower", target: ALL_RIM_SOCKETS, value: null })}
                />
              </OptionRow>
            )}
            {tab === "candle" && (
              <OptionRow label={CUSTOMIZER_COPY.candleColorGroupLabel}>
                {CANDLE_COLOR_PALETTE.map((c) => (
                  <OptionButton
                    key={c}
                    label={CANDLE_COLOR_LABELS[c]}
                    swatch={c}
                    pressed={appearance.candleColor === c}
                    onPress={() => choose({ part: "candleColor", value: c })}
                  />
                ))}
              </OptionRow>
            )}
          </div>
        </>
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
