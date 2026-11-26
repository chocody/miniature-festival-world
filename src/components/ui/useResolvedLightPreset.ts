"use client";

import { useSyncExternalStore } from "react";
import { DAY_NIGHT_HOURS, LIGHT_PRESET_SERVER_FALLBACK, type LightPresetId } from "@/config/look.config";
import { msUntilNextPresetChange, presetForLocalTime } from "@/core/world/timeOfDay";
import { useDeviceStore } from "@/store/useDeviceStore";

/**
 * Notifies at the next local day/night boundary (one setTimeout, re-armed after each boundary) and when the page becomes
 * visible again (timers sleep in background tabs). No per-frame or per-second work. Cleanup clears both.
 */
export function subscribeToPresetBoundaries(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msUntilNextPresetChange(new Date(), DAY_NIGHT_HOURS));
  };
  arm();
  const onVisibility = () => onChange();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

const readAutoPreset = (): LightPresetId => presetForLocalTime(new Date(), DAY_NIGHT_HOURS);
const readServerPreset = (): LightPresetId => LIGHT_PRESET_SERVER_FALLBACK;

/** The light preset in effect: the user's DAY / NIGHT override, else the device's local time (open question 32). */
export function useResolvedLightPreset(): LightPresetId {
  const choice = useDeviceStore((s) => s.lightPresetChoice);
  const auto = useSyncExternalStore(subscribeToPresetBoundaries, readAutoPreset, readServerPreset);
  return choice === "AUTO" ? auto : choice;
}
