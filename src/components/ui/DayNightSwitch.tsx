"use client";

import type { JSX } from "react";
import { DAY_NIGHT_HOURS, LIGHT_PRESET_TOGGLE_COPY } from "@/config/look.config";
import { nextLightPresetChoice, presetForLocalTime } from "@/core/world/timeOfDay"; // not the barrel: it pulls in three
import { getLightPresetPreference } from "@/services/preferences/lightPresetPreference";
import { useDeviceStore } from "@/store/useDeviceStore";
import { MoonIcon, SunIcon } from "./hudIcons";
import { UI_CLASSES } from "./uiClasses";
import { useResolvedLightPreset } from "./useResolvedLightPreset";

/** HUD button recipe (MFW-74): round, 44 px, on the translucent veil (+ `transition-colors`, so reduced motion stays testable); Find My and rotate use the same recipe. */
export const HUD_BUTTON_CLASSES = `${UI_CLASSES.iconButton.replace("bg-paper", "bg-veil")} shadow-float transition-colors`;

/**
 * Day / night toggle (MFW-74, open question 32): one round button showing the sun (DAY) or the moon (NIGHT), no text.
 * A tap switches to the other preset; when that preset is what the local time shows anyway, "AUTO" is stored, so the scene follows
 * the clock again (loop decision for the owner). The choice stays on this device. Hidden before profiling.
 */
export function DayNightSwitch({ now = () => new Date() }: { now?: () => Date }): JSX.Element | null {
  const profiled = useDeviceStore((s) => s.profiled);
  const choice = useDeviceStore((s) => s.lightPresetChoice);
  const shown = useResolvedLightPreset();
  if (!profiled) return null;

  const onClick = () => {
    const next = nextLightPresetChoice(shown, presetForLocalTime(now(), DAY_NIGHT_HOURS));
    getLightPresetPreference().write(next); // false (no storage) still keeps the choice for this session
    useDeviceStore.getState().setLightPresetChoice(next);
  };

  return (
    <button
      type="button"
      data-testid="day-night-toggle"
      data-light-preset={shown}
      data-light-preset-choice={choice}
      aria-label={LIGHT_PRESET_TOGGLE_COPY[shown]}
      className={HUD_BUTTON_CLASSES}
      onClick={onClick}
    >
      {shown === "DAY" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
