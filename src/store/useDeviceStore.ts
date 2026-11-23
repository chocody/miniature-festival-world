import { create } from "zustand";
import { DEFAULT_QUALITY_TIER, type QualityTier } from "@/config/performance.config";

export interface DeviceStoreActions {
  setFps: (fps: number | null) => void;
  /** The ONLY writer of isFallback2D: keeps qualityTier === "FALLBACK_2D" <=> isFallback2D. */
  setQualityTier: (tier: QualityTier) => void;
  setReducedMotion: (reduced: boolean) => void;
}

/**
 * Device status (spec §3: FPS, Quality Tier, Reduced Motion, IsFallback2D).
 * FALLBACK_2D <=> isFallback2D. The store holds no policy: stickiness and no step-up are the controller's job.
 */
export interface DeviceState extends DeviceStoreActions {
  fps: number | null;
  qualityTier: QualityTier;
  reducedMotion: boolean;
  isFallback2D: boolean;
}

export const useDeviceStore = create<DeviceState>()((set) => ({
  fps: null,
  qualityTier: DEFAULT_QUALITY_TIER,
  reducedMotion: false,
  isFallback2D: false,
  setFps: (fps) => set({ fps }),
  setQualityTier: (tier) => set({ qualityTier: tier, isFallback2D: tier === "FALLBACK_2D" }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
}));
