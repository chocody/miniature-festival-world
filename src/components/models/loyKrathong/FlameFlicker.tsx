"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useIdleRedraw } from "@/components/canvas3d/idleRedraw";
import { applyFlameGlow } from "@/components/canvas3d/sceneLook";
import { FLAME_FLICKER_REDRAW_INTERVAL_MS } from "@/config/krathongModel.config";
import { writeFlameFlickerAt } from "@/core/customization/flameFlicker";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useKrathongAssets } from "./KrathongAssetsProvider";

export interface FlameFlickerProps {
  readonly baseEmissiveIntensity: number; // LIGHT_PRESETS[preset].flame.emissiveIntensity
  readonly reducedMotion: boolean;
  readonly now?: () => number; // default: performance.now()
}

const performanceNow = () => performance.now();

/**
 * Drives the shared flame flicker of one canvas (MFW-48 AC2). Per frame it writes `assets.flameFlicker`
 * (read by every KrathongModel flame and the river batch) and the shared flame emissive; no allocation, no React state.
 * The demand loop is kept alive by a per-tier interval on the shared idle-redraw ticker (idleRedraw.ts), not continuous frames.
 * Reduced motion and FALLBACK_2D: static flame, no interval.
 */
export function FlameFlicker({ baseEmissiveIntensity, reducedMotion, now = performanceNow }: FlameFlickerProps): null {
  const assets = useKrathongAssets();
  const invalidate = useThree((s) => s.invalidate);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const flickerOff = reducedMotion || qualityTier === "FALLBACK_2D";

  useFrame(() => {
    writeFlameFlickerAt(now(), flickerOff, assets.flameFlicker);
    applyFlameGlow(assets.material("flame"), baseEmissiveIntensity * assets.flameFlicker.emissiveScale);
  });

  useEffect(() => {
    if (reducedMotion || qualityTier === "FALLBACK_2D") {
      writeFlameFlickerAt(0, true, assets.flameFlicker);
      applyFlameGlow(assets.material("flame"), baseEmissiveIntensity);
      invalidate();
      return;
    }
    invalidate();
  }, [reducedMotion, qualityTier, assets, baseEmissiveIntensity, invalidate]);

  // The demand loop is kept alive through the canvas's ONE shared idle-redraw ticker (MFW-50 fix round).
  useIdleRedraw(reducedMotion || qualityTier === "FALLBACK_2D" ? null : FLAME_FLICKER_REDRAW_INTERVAL_MS[qualityTier]);

  return null;
}
