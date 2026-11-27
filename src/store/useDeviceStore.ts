import { create } from "zustand";
import type { LightPresetChoice } from "@/config/look.config";
import { SKY_LAUNCH_DEFAULT_KIND, type SkyLaunchKind } from "@/config/gimmicks.config";
import { DEFAULT_QUALITY_TIER, type QualityTier } from "@/config/performance.config";

export interface DeviceStoreActions {
  setFps: (fps: number | null) => void;
  /** Written once by the profiler, before setQualityTier (MFW-71). */
  setWebglAvailable: (available: boolean) => void;
  setQualityTier: (tier: QualityTier) => void;
  setReducedMotion: (reduced: boolean) => void;
  /** Only sets the field; persistence is src/services/preferences (MFW-47). */
  setLightPresetChoice: (choice: LightPresetChoice) => void;
  /** Only sets the field; persistence is src/services/preferences (MFW-85). */
  setSkyLaunchChoice: (kind: SkyLaunchKind) => void;
}

/**
 * Device status (spec §3: FPS, Quality Tier, Reduced Motion, IsFallback2D, replaced by webglAvailable in MFW-71).
 * The store holds no policy: LOW being final and no step-up are the controller's job.
 * lightPresetChoice: per-device display preference (open question 32): AUTO follows the local time, DAY/NIGHT override it.
 * skyLaunchChoice: per-device display preference (MFW-85, DRAFT): what a tap on empty ground launches, a firework or a sky lantern.
 */
export interface DeviceState extends DeviceStoreActions {
  fps: number | null;
  qualityTier: QualityTier;
  /** True only after the client profiler has selected the initial rendering tier. */
  profiled: boolean;
  reducedMotion: boolean;
  /** false only when the profiler found no WebGL; the stage then shows a notice instead of the scene (MFW-71). */
  webglAvailable: boolean;
  lightPresetChoice: LightPresetChoice;
  skyLaunchChoice: SkyLaunchKind;
}

export const useDeviceStore = create<DeviceState>()((set) => ({
  fps: null,
  qualityTier: DEFAULT_QUALITY_TIER,
  profiled: false,
  reducedMotion: false,
  webglAvailable: true,
  lightPresetChoice: "AUTO",
  skyLaunchChoice: SKY_LAUNCH_DEFAULT_KIND,
  setFps: (fps) => set({ fps }),
  setWebglAvailable: (available) => set({ webglAvailable: available }),
  setQualityTier: (tier) => set({ qualityTier: tier, profiled: true }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  setLightPresetChoice: (choice) => set({ lightPresetChoice: choice }),
  setSkyLaunchChoice: (kind) => set({ skyLaunchChoice: kind }),
}));
