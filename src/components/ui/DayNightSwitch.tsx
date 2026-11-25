"use client";

import { useRef, type JSX, type KeyboardEvent } from "react";
import { LIGHT_PRESET_CHOICES, LIGHT_PRESET_SWITCH_COPY as COPY, type LightPresetChoice } from "@/config/look.config";
import { getLightPresetPreference } from "@/services/preferences/lightPresetPreference";
import { useDeviceStore } from "@/store/useDeviceStore";

function choose(choice: LightPresetChoice): void {
  getLightPresetPreference().write(choice); // false (no storage) still keeps the choice for this session
  useDeviceStore.getState().setLightPresetChoice(choice);
}

/** Target index for a roving radio-group key, or null when the key is not handled (WAI-ARIA radio group). */
function targetIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Day / night switch for the 3D scene (open question 32, MFW-47): AUTO follows the device's local time, DAY / NIGHT
 * override it; the choice stays on this device. Hidden before profiling and on FALLBACK_2D (2D day/night is MFW-51).
 * Keyboard: one tab stop (the checked radio); arrow keys, Home and End move the choice. Visual design DRAFT (MFW-55).
 */
export function DayNightSwitch(): JSX.Element | null {
  const profiled = useDeviceStore((s) => s.profiled);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const choice = useDeviceStore((s) => s.lightPresetChoice);
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  if (!profiled || qualityTier === "FALLBACK_2D") return null;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = targetIndex(event.key, index, LIGHT_PRESET_CHOICES.length);
    if (next === null) return;
    event.preventDefault();
    choose(LIGHT_PRESET_CHOICES[next]);
    radios.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={COPY.groupLabel}
      data-light-preset-choice={choice}
      className="flex w-fit items-center gap-1 rounded-full bg-veil text-caption text-ink shadow-raised"
    >
      {LIGHT_PRESET_CHOICES.map((option, index) => {
        const checked = option === choice;
        return (
          <button
            key={option}
            ref={(el) => {
              radios.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`min-h-11 min-w-11 rounded-full px-3 transition-colors ${
              checked ? "bg-clay-soft font-semibold text-ink" : "text-ink-muted hover:bg-clay-soft"
            }`}
          >
            {COPY[option]}
          </button>
        );
      })}
    </div>
  );
}
