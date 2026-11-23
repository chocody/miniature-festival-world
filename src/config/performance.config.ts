/** Rendering quality tiers (spec §3: High, Medium, Low, Fallback 2D). */
export const QUALITY_TIERS = ["HIGH", "MEDIUM", "LOW", "FALLBACK_2D"] as const;

export type QualityTier = (typeof QUALITY_TIERS)[number];

/** SSR / pre-detection default; the client profiler (MFW-9) replaces it after mount. Also the owner's 'otherwise MEDIUM' tier. */
export const DEFAULT_QUALITY_TIER: QualityTier = "MEDIUM";

/** Tiers that render 3D (FALLBACK_2D renders the 2D view instead). */
export type RenderTier = Exclude<QualityTier, "FALLBACK_2D">;

// Owner numbers (owner, 2026-11-23, open question #5)

/** Avg FPS below this, sustained, switches any 3D tier to FALLBACK_2D (owner, 2026-11-23, open question #5). */
export const FALLBACK_FPS_THRESHOLD = 20;
/** Avg FPS below this, sustained, steps the tier down; null = no step-down (owner, 2026-11-23, open question #5). */
export const STEP_DOWN_FPS_THRESHOLD: Readonly<Record<RenderTier, number | null>> = Object.freeze({
  HIGH: 45,
  MEDIUM: 30,
  LOW: null,
});
/** How long FPS must stay below a threshold (owner, 2026-11-23, open question #5). */
export const FPS_SUSTAIN_MS = 5_000;
/** Frames after a meter (re)start are ignored for this long (owner, 2026-11-23, open question #5). */
export const FPS_WARMUP_MS = 2_000;
/** Minimum deviceMemory (GB) for the HIGH tier (owner, 2026-11-23, open question #5). */
export const HIGH_TIER_MIN_DEVICE_MEMORY_GB = 8;
/** Minimum hardwareConcurrency for the HIGH tier (owner, 2026-11-23, open question #5). */
export const HIGH_TIER_MIN_HARDWARE_CONCURRENCY = 8;
/** deviceMemory (GB) at or below this means the LOW tier (owner, 2026-11-23, open question #5). */
export const LOW_TIER_MAX_DEVICE_MEMORY_GB = 3;
/** hardwareConcurrency at or below this means the LOW tier (owner, 2026-11-23, open question #5). */
export const LOW_TIER_MAX_HARDWARE_CONCURRENCY = 4;

export interface TierBudget {
  /** Upper bound for renderer pixel ratio: min(devicePixelRatio, pixelRatioCap). */
  readonly pixelRatioCap: number;
  readonly shadows: boolean;
  /** Max texture edge in px. */
  readonly maxTextureSize: number;
}

/** Per-tier render budgets (owner, 2026-11-23, open question #5). FALLBACK_2D has no 3D budget. */
export const TIER_BUDGETS: Readonly<Record<RenderTier, TierBudget>> = Object.freeze({
  HIGH: Object.freeze({ pixelRatioCap: 2, shadows: true, maxTextureSize: 2048 }),
  MEDIUM: Object.freeze({ pixelRatioCap: 1.5, shadows: false, maxTextureSize: 1024 }),
  LOW: Object.freeze({ pixelRatioCap: 1, shadows: false, maxTextureSize: 512 }),
});

// Technical numbers (lead decision, MFW-9)

/** Each FPS sample is the average over one window of this length (back-to-back windows). */
export const FPS_SAMPLE_WINDOW_MS = 1_000;
/** After a tier change, samples that start within this time are ignored. */
export const TIER_SETTLE_MS = 2_000;
/** A single gap between frames longer than this is a stall (freeze, dialog, load), not low FPS: discard the window and re-arm warm-up. Lead decision, MFW-9. */
export const FPS_STALL_GAP_MS = 1_000;
