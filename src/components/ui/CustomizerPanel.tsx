"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
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
      className={`flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition-colors motion-reduce:transition-none ${
        pressed
          ? "border-amber-500 bg-amber-100 font-semibold text-amber-950 dark:bg-amber-400/20 dark:text-amber-100"
          : "border-black/10 bg-white text-zinc-800 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
      }`}
    >
      {swatch && (
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded-full border border-black/20"
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
      className="grid min-h-11 min-w-11 place-items-center rounded-full border border-black/10 bg-white text-lg dark:border-white/15 dark:bg-zinc-800"
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
  const barRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  // Keep an in-flow spacer as tall as the fixed bar, so content above it can always scroll clear of the bar.
  useEffect(() => {
    const bar = barRef.current;
    const spacer = spacerRef.current;
    if (!bar || !spacer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      spacer.style.height = `${bar.offsetHeight}px`;
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // The result is ignored on purpose: the buttons only offer catalogue values, so a failure is unreachable.
  const choose = (choice: KrathongChoice) => {
    chooseKrathong(choice);
  };
  const flowerSelection = getFlowerSelection(appearance, ALL_RIM_SOCKETS);
  const tabId = (id: CustomizerTabId) => `${idBase}-tab-${id}`;
  const panelId = `${idBase}-tabpanel`;

  return (
    <>
      <div ref={spacerRef} aria-hidden="true" data-testid="customizer-spacer" className="shrink-0" />
      <section
        ref={barRef}
        aria-label={CUSTOMIZER_COPY.panelLabel}
        data-testid="customizer-panel"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-t-3xl border-t border-black/10 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.12)] touch-manipulation dark:border-white/15 dark:bg-zinc-900/95"
      >
        {viewControlRef && <p className="text-xs text-zinc-600 dark:text-zinc-300">{CUSTOMIZER_COPY.gestureHint}</p>}
        {eventId === "loy_krathong" && (
          <>
            <div role="tablist" aria-label={CUSTOMIZER_COPY.tabListLabel} className="grid grid-cols-4 gap-1">
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
                  className={`min-h-11 min-w-11 rounded-full text-sm ${tab === t.id ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"}`}
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
            type="button"
            onClick={onDone}
            className="ml-auto min-h-11 min-w-11 rounded-full bg-zinc-900 px-5 text-white transition-colors motion-reduce:transition-none hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {CUSTOMIZER_COPY.done}
          </button>
        </div>
      </section>
    </>
  );
}
