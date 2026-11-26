import {
  HIGH_TIER_MIN_DEVICE_MEMORY_GB,
  HIGH_TIER_MIN_HARDWARE_CONCURRENCY,
  LOW_TIER_MAX_DEVICE_MEMORY_GB,
  LOW_TIER_MAX_HARDWARE_CONCURRENCY,
  type QualityTier,
} from "@/config/performance.config";
import type { DeviceCapabilities } from "./deviceCapabilities";

/**
 * Initial tier from hardware hints. A missing hint is unknown: it can never prove HIGH
 * and never proves LOW by itself, so the result is neutral (MEDIUM).
 */
export function pickInitialTier(
  caps: Pick<DeviceCapabilities, "deviceMemoryGb" | "hardwareConcurrency">,
): QualityTier {
  const { deviceMemoryGb: mem, hardwareConcurrency: cores } = caps;
  if (
    mem !== null &&
    cores !== null &&
    mem >= HIGH_TIER_MIN_DEVICE_MEMORY_GB &&
    cores >= HIGH_TIER_MIN_HARDWARE_CONCURRENCY
  ) {
    return "HIGH";
  }
  if (
    (mem !== null && mem <= LOW_TIER_MAX_DEVICE_MEMORY_GB) ||
    (cores !== null && cores <= LOW_TIER_MAX_HARDWARE_CONCURRENCY)
  ) {
    return "LOW";
  }
  return "MEDIUM";
}
