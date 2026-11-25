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
  /**
   * Max river krathongs rendered at once on this tier (≤ ZONE_ITEM_CAP; a zone still loads up to 80 — the rest stay in the
   * store for Find My). PLACEHOLDER lead values (spec silent, MFW-25 Open question 7) until MFW-34 instancing lands.
   */
  readonly riverItemCap: number;
  /** River krathongs cast shadows (only where `shadows` is on too). PLACEHOLDER (MFW-25 Open question 7). */
  readonly riverItemCastShadow: boolean;
}

/** Per-tier render budgets (owner, 2026-11-23, open question #5). FALLBACK_2D has no 3D budget. */
// riverItemCap / riverItemCastShadow: PLACEHOLDER lead values (MFW-25, MFW-24 perf review), not owner numbers.
export const TIER_BUDGETS: Readonly<Record<RenderTier, TierBudget>> = Object.freeze({
  HIGH: Object.freeze({ pixelRatioCap: 2, shadows: true, maxTextureSize: 2048, riverItemCap: 80, riverItemCastShadow: true }),
  MEDIUM: Object.freeze({ pixelRatioCap: 1.5, shadows: false, maxTextureSize: 1024, riverItemCap: 48, riverItemCastShadow: false }),
  LOW: Object.freeze({ pixelRatioCap: 1, shadows: false, maxTextureSize: 512, riverItemCap: 24, riverItemCastShadow: false }),
});

// Technical numbers (lead decision, MFW-9)

/** Each FPS sample is the average over one window of this length (back-to-back windows). */
export const FPS_SAMPLE_WINDOW_MS = 1_000;
/** After a tier change, samples that start within this time are ignored. */
export const TIER_SETTLE_MS = 2_000;
/** A single gap between frames longer than this is a stall (freeze, dialog, load), not low FPS: discard the window and re-arm warm-up. Lead decision, MFW-9. */
export const FPS_STALL_GAP_MS = 1_000;

// Technical numbers (lead decision, MFW-27)

/**
 * WebGL MSAA per 3D tier. The renderer reads it only when it is created, so SceneViewport re-creates the canvas when
 * the value flips (at most once per session: tiers never step up). Lead decision, MFW-27.
 */
export const TIER_ANTIALIAS: Readonly<Record<RenderTier, boolean>> = Object.freeze({
  HIGH: true,
  MEDIUM: true,
  LOW: false,
});

// Technical numbers (lead decision, MFW-28). Values PLACEHOLDER (spec silent); the owner may tune them (MFW-28 plan §11 Q3).

/** Pooled scene effects (spec §3 core/effects: "ObjectPoolManager (Ripples, Fireworks, Confetti, Glow)"). Phase 1 uses ripple + glow only. */
export const EFFECT_KINDS = ["ripple", "glow"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];
export type EffectPoolCaps = Readonly<Record<EffectKind, number>>;

/** Max concurrent pooled effects per 3D tier (invariant E: fixed cap; a new tap recycles the oldest). PLACEHOLDER (spec silent). */
export const EFFECT_POOL_CAPS: Readonly<Record<RenderTier, EffectPoolCaps>> = Object.freeze({
  HIGH: Object.freeze({ ripple: 8, glow: 6 }),
  MEDIUM: Object.freeze({ ripple: 6, glow: 4 }),
  LOW: Object.freeze({ ripple: 3, glow: 2 }),
});

// Technical numbers (lead decision, MFW-33)

/** Pooled 2D effects on FALLBACK_2D (invariant E): the weakest 3D tier's caps, so a weak device never runs more effects in 2D than on LOW. */
export const FALLBACK_2D_EFFECT_POOL_CAPS: EffectPoolCaps = EFFECT_POOL_CAPS.LOW;
