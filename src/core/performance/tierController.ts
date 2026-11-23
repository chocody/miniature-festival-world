import {
  FALLBACK_FPS_THRESHOLD,
  FPS_SUSTAIN_MS,
  STEP_DOWN_FPS_THRESHOLD,
  TIER_SETTLE_MS,
  type QualityTier,
  type RenderTier,
} from "@/config/performance.config";
import type { FpsSample } from "./fpsMeter";

export type TierChangeReason = "FPS_BELOW_STEP_DOWN_THRESHOLD" | "FPS_BELOW_FALLBACK_THRESHOLD";
export interface TierDecision {
  from: QualityTier;
  to: QualityTier;
  reason: TierChangeReason;
  atMs: number;
}
export interface TierControllerConfig {
  fallbackFps: number;
  stepDownFps: Readonly<Record<RenderTier, number | null>>;
  sustainMs: number;
  settleMs: number;
}
export const DEFAULT_TIER_CONTROLLER_CONFIG: TierControllerConfig = {
  fallbackFps: FALLBACK_FPS_THRESHOLD,
  stepDownFps: STEP_DOWN_FPS_THRESHOLD,
  sustainMs: FPS_SUSTAIN_MS,
  settleMs: TIER_SETTLE_MS,
};
export interface TierController {
  readonly tier: QualityTier;
  onSample(s: FpsSample): TierDecision | null;
  reset(): void;
}

const NEXT_LOWER: Record<"HIGH" | "MEDIUM", RenderTier> = { HIGH: "MEDIUM", MEDIUM: "LOW" };

/**
 * Decides tier changes from FPS samples. Steps down only (never up); FALLBACK_2D is sticky.
 * Fallback takes precedence over a step-down.
 */
export function createTierController(
  initialTier: QualityTier,
  config: TierControllerConfig = DEFAULT_TIER_CONTROLLER_CONFIG,
): TierController {
  let tier = initialTier;
  let fallbackStart: number | null = null;
  let stepStart: number | null = null;
  let settleUntil = -Infinity;

  function clearStreaks() {
    fallbackStart = null;
    stepStart = null;
  }

  return {
    get tier() {
      return tier;
    },
    onSample(s) {
      if (tier === "FALLBACK_2D") return null;
      if (!Number.isFinite(s.fps)) return null;
      if (s.startMs < settleUntil) return null;

      if (s.fps < config.fallbackFps) fallbackStart ??= s.startMs;
      else fallbackStart = null;

      const threshold = config.stepDownFps[tier];
      if (threshold !== null && s.fps < threshold) stepStart ??= s.startMs;
      else stepStart = null;

      let to: QualityTier | null = null;
      let reason: TierChangeReason = "FPS_BELOW_FALLBACK_THRESHOLD";
      if (fallbackStart !== null && s.endMs - fallbackStart >= config.sustainMs) {
        to = "FALLBACK_2D";
      } else if (
        stepStart !== null &&
        s.endMs - stepStart >= config.sustainMs &&
        (tier === "HIGH" || tier === "MEDIUM")
      ) {
        to = NEXT_LOWER[tier];
        reason = "FPS_BELOW_STEP_DOWN_THRESHOLD";
      }
      if (to === null) return null;

      const decision: TierDecision = { from: tier, to, reason, atMs: s.endMs };
      tier = to;
      clearStreaks();
      settleUntil = s.endMs + config.settleMs;
      return decision;
    },
    reset: clearStreaks,
  };
}
