"use client";

import { useEffect } from "react";
import { startDeviceProfiler } from "@/core/performance";
import { useDeviceStore } from "@/store/useDeviceStore";

/** Renderless: profiles the device after mount and keeps useDeviceStore updated. No SSR output. */
export function DeviceProfiler(): null {
  useEffect(() => {
    const { setFps, setQualityTier, setReducedMotion } = useDeviceStore.getState();
    return startDeviceProfiler({ setFps, setQualityTier, setReducedMotion });
  }, []);
  return null;
}
