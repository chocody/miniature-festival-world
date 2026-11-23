/** Rendering quality tiers (spec §3: High, Medium, Low, Fallback 2D). */
export const QUALITY_TIERS = ["HIGH", "MEDIUM", "LOW", "FALLBACK_2D"] as const;

export type QualityTier = (typeof QUALITY_TIERS)[number];

/** Placeholder until the MFW-9 profiler decides. */
export const DEFAULT_QUALITY_TIER: QualityTier = "MEDIUM";
