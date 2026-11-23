import { create } from "zustand";
import { DEFAULT_QUALITY_TIER, type QualityTier } from "@/config/performance.config";

/** Device status (spec §3: FPS, Quality Tier, Reduced Motion, IsFallback2D). */
export interface DeviceState {
  fps: number | null;
  qualityTier: QualityTier;
  reducedMotion: boolean;
  isFallback2D: boolean;
}

export const useDeviceStore = create<DeviceState>()(() => ({
  fps: null,
  qualityTier: DEFAULT_QUALITY_TIER,
  reducedMotion: false,
  isFallback2D: false,
}));
