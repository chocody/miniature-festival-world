"use client";

import { useMemo } from "react";
import { resolveLivingWorldSettings, type LivingWorldSettings } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";

/** MFW-50: what the living world shows and moves on this device (quality tier + reduced motion from the store, invariant F). */
export function useLivingWorldSettings(): LivingWorldSettings {
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  return useMemo(() => resolveLivingWorldSettings(qualityTier, reducedMotion), [qualityTier, reducedMotion]);
}
