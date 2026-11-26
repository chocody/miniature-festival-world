"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
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
 * The demand loop is kept alive by a per-tier redraw interval instead of continuous frames (bounded CPU cost).
 * Reduced motion and FALLBACK_2D: static flame, no interval. The interval pauses while the document is hidden (MFW-69).
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
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      invalidate();
      id = window.setInterval(invalidate, FLAME_FLICKER_REDRAW_INTERVAL_MS[qualityTier]);
    };
    const stop = () => {
      if (id === null) return;
      window.clearInterval(id);
      id = null;
    };
    // MFW-69 (MFW-48 follow-up): no redraws while the page is hidden.
    const onVisibility = () => (document.hidden ? stop() : start());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [reducedMotion, qualityTier, assets, baseEmissiveIntensity, invalidate]);

  return null;
}
