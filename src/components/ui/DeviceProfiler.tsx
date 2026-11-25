"use client";

import { useEffect } from "react";
import { startDeviceProfiler } from "@/core/performance";
import { getLightPresetPreference } from "@/services/preferences/lightPresetPreference";
import { useDeviceStore } from "@/store/useDeviceStore";

/** Renderless: profiles the device after mount and keeps useDeviceStore updated (and hydrates the light preset). No SSR output. */
export function DeviceProfiler(): null {
  useEffect(() => {
    const { setFps, setQualityTier, setReducedMotion, setLightPresetChoice } = useDeviceStore.getState();
    setLightPresetChoice(getLightPresetPreference().read()); // hydrate the per-device light preset once (MFW-47)
    return startDeviceProfiler({ setFps, setQualityTier, setReducedMotion });
  }, []);
  return null;
}
