"use client";

import type { JSX } from "react";
import { LIGHT_PRESET_CHOICES, LIGHT_PRESET_SWITCH_COPY as COPY, type LightPresetChoice } from "@/config/look.config";
import { getLightPresetPreference } from "@/services/preferences/lightPresetPreference";
import { useDeviceStore } from "@/store/useDeviceStore";

function choose(choice: LightPresetChoice): void {
  getLightPresetPreference().write(choice); // false (no storage) still keeps the choice for this session
  useDeviceStore.getState().setLightPresetChoice(choice);
}

/**
 * Day / night switch for the 3D scene (open question 32, MFW-47): AUTO follows the device's local time, DAY / NIGHT
 * override it; the choice stays on this device. Hidden before profiling and on FALLBACK_2D (2D day/night is MFW-51).
 * Visual design DRAFT.
 */
export function DayNightSwitch(): JSX.Element | null {
  const profiled = useDeviceStore((s) => s.profiled);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const choice = useDeviceStore((s) => s.lightPresetChoice);
  if (!profiled || qualityTier === "FALLBACK_2D") return null;
  return (
    <div
      role="radiogroup"
      aria-label={COPY.groupLabel}
      data-light-preset-choice={choice}
      className="flex w-fit items-center gap-1 rounded-full border border-stone-200 bg-white/90 p-1 text-xs text-stone-700 shadow-sm"
    >
      {LIGHT_PRESET_CHOICES.map((option) => {
        const checked = option === choice;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => choose(option)}
            className={`rounded-full px-3 py-1 transition-colors ${
              checked ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {COPY[option]}
          </button>
        );
      })}
    </div>
  );
}
