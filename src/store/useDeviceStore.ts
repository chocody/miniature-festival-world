import { create } from "zustand";
import type { LightPresetChoice } from "@/config/look.config";
import { DEFAULT_QUALITY_TIER, type QualityTier } from "@/config/performance.config";

export interface DeviceStoreActions {
  setFps: (fps: number | null) => void;
  /** The ONLY writer of isFallback2D: keeps qualityTier === "FALLBACK_2D" <=> isFallback2D. */
  setQualityTier: (tier: QualityTier) => void;
  setReducedMotion: (reduced: boolean) => void;
  /** Only sets the field; persistence is src/services/preferences (MFW-47). */
  setLightPresetChoice: (choice: LightPresetChoice) => void;
}

/**
 * Device status (spec §3: FPS, Quality Tier, Reduced Motion, IsFallback2D).
 * FALLBACK_2D <=> isFallback2D. The store holds no policy: stickiness and no step-up are the controller's job.
 * lightPresetChoice: per-device display preference (open question 32): AUTO follows the local time, DAY/NIGHT override it.
 */
export interface DeviceState extends DeviceStoreActions {
  fps: number | null;
  qualityTier: QualityTier;
  /** True only after the client profiler has selected the initial rendering tier. */
  profiled: boolean;
  reducedMotion: boolean;
  isFallback2D: boolean;
  lightPresetChoice: LightPresetChoice;
}

export const useDeviceStore = create<DeviceState>()((set) => ({
  fps: null,
  qualityTier: DEFAULT_QUALITY_TIER,
  profiled: false,
  reducedMotion: false,
  isFallback2D: false,
  lightPresetChoice: "AUTO",
  setFps: (fps) => set({ fps }),
  setQualityTier: (tier) =>
    set({ qualityTier: tier, profiled: true, isFallback2D: tier === "FALLBACK_2D" }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  setLightPresetChoice: (choice) => set({ lightPresetChoice: choice }),
}));
