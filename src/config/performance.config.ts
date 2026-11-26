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

/**
 * Max renderer drawing-buffer pixels (screen CSS area × pixel ratio²) per 3D tier; null = no cap (MFW-54). The full-screen stage
 * made the canvas 5–7× larger than the old 704×256 box, so a big screen renders at a lower pixel ratio (LOW even below 1) instead
 * of spending the frame budget on fill or dropping to FALLBACK_2D. PLACEHOLDER (spec silent; owner to confirm): HIGH ≈ 2.5 MP
 * and MEDIUM ≈ 1.5 MP leave phones at their pixelRatioCap and trim retina desktops; LOW = a 390×844 phone at pixel ratio 1,
 * the size SwiftShader e2e holds above FALLBACK_FPS_THRESHOLD.
 */
export const TIER_MAX_RENDER_PIXELS: Readonly<Record<RenderTier, number | null>> = Object.freeze({
  HIGH: 2_500_000,
  MEDIUM: 1_500_000,
  LOW: 390 * 844,
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

// Technical numbers (lead decision, MFW-49)

/**
 * Water effects per 3D tier. LOW = the AC4 cheap variant: static shore highlights only, no moving glints, no krathong ripples.
 * HIGH glintCount 10 → 6 (MFW-49 dev, the lead's first ordered cut for the SwiftShader CI frame budget; equals MEDIUM).
 */
export const WATER_EFFECT_TIERS: Readonly<Record<RenderTier, Readonly<{ glintCount: number; krathongRipples: boolean }>>> =
  Object.freeze({
    HIGH: Object.freeze({ glintCount: 6, krathongRipples: true }),
    MEDIUM: Object.freeze({ glintCount: 6, krathongRipples: true }),
    LOW: Object.freeze({ glintCount: 0, krathongRipples: false }),
  });

/**
 * Environment render budget per 3D tier: static riverside + water effects, main pass, the heavier NIGHT preset, no river krathongs.
 * Lead regression guard (not an owner number), MFW-49; guarded by environmentBudget.test.tsx. Krathong ripples are extra:
 * KRATHONG_RIPPLE_MAX_TRIANGLES per rendered krathong and one draw call (HIGH/MEDIUM only).
 * MFW-70 (lead override, owner review 2026-11-25 "only squares and triangles"): triangles HIGH 6 500 → 7 800 (+1 300) and
 * MEDIUM 5 850 → 7 350 (+1 500, the allowed maximum) so tree crowns and bushes can use smooth detail-1 leaf clumps (80
 * triangles each) instead of faceted 20-triangle ones. Draw calls and LOW are unchanged (LOW foliage got lighter).
 */
export const ENVIRONMENT_RENDER_BUDGETS: Readonly<Record<RenderTier, Readonly<{ maxDrawCalls: number; maxTriangles: number }>>> =
  Object.freeze({
    HIGH: Object.freeze({ maxDrawCalls: 21, maxTriangles: 7_800 }),
    MEDIUM: Object.freeze({ maxDrawCalls: 21, maxTriangles: 7_350 }),
    LOW: Object.freeze({ maxDrawCalls: 20, maxTriangles: 5_400 }),
  });

/** Max triangles of one krathong ripple ring (the ring fan of RIVER_WATER_HIGHLIGHTS.ripple). Lead regression guard, MFW-49. */
export const KRATHONG_RIPPLE_MAX_TRIANGLES = 48;

// Technical numbers (lead decision, MFW-70)

export const FOLIAGE_VARIANTS = ["FULL", "LIGHT"] as const;
export type FoliageVariant = (typeof FOLIAGE_VARIANTS)[number];
/**
 * Foliage per 3D tier (MFW-70 AC3/AC4): LOW draws the LIGHT variant (fewer clumps, one branch, 3-blade tufts) and never sways.
 * Sway is also off under reduced motion (RiversideFoliage). Same 3 draw calls on every tier. Lead decision, not an owner number.
 */
export const FOLIAGE_TIERS: Readonly<Record<RenderTier, Readonly<{ variant: FoliageVariant; sway: boolean }>>> = Object.freeze({
  HIGH: Object.freeze({ variant: "FULL", sway: true }),
  MEDIUM: Object.freeze({ variant: "FULL", sway: true }),
  LOW: Object.freeze({ variant: "LIGHT", sway: false }),
});
