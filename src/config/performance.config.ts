/** Rendering quality tiers (spec §3: High, Medium, Low; the 2D fallback tier was removed in MFW-71, owner, 2026-11-26). */
export const QUALITY_TIERS = ["HIGH", "MEDIUM", "LOW"] as const;

export type QualityTier = (typeof QUALITY_TIERS)[number];

/** SSR / pre-detection default; the client profiler (MFW-9) replaces it after mount. Also the owner's 'otherwise MEDIUM' tier. */
export const DEFAULT_QUALITY_TIER: QualityTier = "MEDIUM";

/** Every tier renders 3D since MFW-71; kept as the key type of the per-tier 3D tables. */
export type RenderTier = QualityTier;

/** Lowest tier: the FPS controller's final step and the tier recorded without WebGL (MFW-71). */
export const FLOOR_QUALITY_TIER: QualityTier = "LOW";

// Owner numbers (owner, 2026-11-23, open question #5)

/** Avg FPS below this, sustained FPS_SUSTAIN_MS, drops HIGH or MEDIUM straight to LOW, which is final (owner, 2026-11-23, open
 *  question #5; target was FALLBACK_2D until the owner removed 2D, 2026-11-26). Renamed from FALLBACK_FPS_THRESHOLD. */
export const DROP_TO_LOW_FPS_THRESHOLD = 20;
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

/** Per-tier render budgets (owner, 2026-11-23, open question #5). */
// riverItemCap / riverItemCastShadow: PLACEHOLDER lead values (MFW-25, MFW-24 perf review), not owner numbers.
export const TIER_BUDGETS: Readonly<Record<RenderTier, TierBudget>> = Object.freeze({
  HIGH: Object.freeze({ pixelRatioCap: 2, shadows: true, maxTextureSize: 2048, riverItemCap: 80, riverItemCastShadow: true }),
  MEDIUM: Object.freeze({ pixelRatioCap: 1.5, shadows: false, maxTextureSize: 1024, riverItemCap: 48, riverItemCastShadow: false }),
  LOW: Object.freeze({ pixelRatioCap: 1, shadows: false, maxTextureSize: 512, riverItemCap: 24, riverItemCastShadow: false }),
});

/**
 * Lead guard (MFW-65, not an owner number): river krathong triangles of a full HIGH zone — riverItemCap × one krathong at
 * KRATHONG_RIVER_LOD_BY_TIER.HIGH, × 2 because the HIGH river also draws the shadow pass. Set at the measured value of the
 * owner-supplied design banana_leaf_01 (80 × 1 056 × 2 = 168 960; the procedural worst case at MFW-69 was 80 × 992 × 2).
 * Tested in tests/unit/krathong-model-assets.test.ts (KA4c). Raise only with a phone check (docs/perf/MFW-65.md §5).
 */
export const HIGH_RIVER_KRATHONG_ZONE_MAX_TRIANGLES = 168_960;

/**
 * Max renderer drawing-buffer pixels (screen CSS area × pixel ratio²) per 3D tier; null = no cap (MFW-54). The full-screen stage
 * made the canvas 5–7× larger than the old 704×256 box, so a big screen renders at a lower pixel ratio (LOW even below 1) instead
 * of spending the frame budget on fill or stepping down. PLACEHOLDER (spec silent; owner to confirm): HIGH ≈ 2.5 MP
 * and MEDIUM ≈ 1.5 MP leave phones at their pixelRatioCap and trim retina desktops; LOW = a 390×844 phone at pixel ratio 1,
 * the size SwiftShader e2e holds above DROP_TO_LOW_FPS_THRESHOLD.
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

/**
 * Pooled scene effects (spec §3 core/effects: "ObjectPoolManager (Ripples, Fireworks, Confetti, Glow)"). ripple + glow since MFW-28;
 * MFW-60 adds nudge (a tapped tree / bush / reed / rock / pier / villager moves), windowGlow (house lights), firework and skyLantern;
 * MFW-72 adds chimneySmoke (a smoke puff from a tapped house's roof) and fallingLeaves (a few leaves fall from a tapped tree).
 */
export const EFFECT_KINDS = [
  "ripple",
  "glow",
  "nudge",
  "windowGlow",
  "firework",
  "skyLantern",
  "chimneySmoke",
  "fallingLeaves",
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];
export type EffectPoolCaps = Readonly<Record<EffectKind, number>>;

/**
 * Max concurrent pooled effects per 3D tier (invariant E: fixed cap; a new tap recycles the oldest). ripple / glow: PLACEHOLDER
 * (spec silent, MFW-28). nudge / windowGlow / firework / skyLantern: DRAFT (MFW-60 loop decision, not yet reviewed by the owner).
 * chimneySmoke / fallingLeaves (concurrent smokes / leaf falls, = the windowGlow column): DRAFT (MFW-72 loop decision, not yet
 * reviewed by the owner).
 */
export const EFFECT_POOL_CAPS: Readonly<Record<RenderTier, EffectPoolCaps>> = Object.freeze({
  HIGH: Object.freeze({ ripple: 8, glow: 6, nudge: 8, windowGlow: 3, firework: 3, skyLantern: 4, chimneySmoke: 3, fallingLeaves: 3 }),
  MEDIUM: Object.freeze({ ripple: 6, glow: 4, nudge: 6, windowGlow: 2, firework: 2, skyLantern: 3, chimneySmoke: 2, fallingLeaves: 2 }),
  LOW: Object.freeze({ ripple: 3, glow: 2, nudge: 4, windowGlow: 1, firework: 1, skyLantern: 1, chimneySmoke: 1, fallingLeaves: 1 }),
});

/**
 * Sparks per firework burst per 3D tier (LOW = the cheap variant); each spark is a head and a tail instance (FIREWORK_LOOK). Raised
 * from the spec's 24 / 16 / 8 after the MFW-60 screenshots (the burst did not read as a firework). DRAFT (MFW-60 loop decision, not
 * yet reviewed by the owner).
 */
export const FIREWORK_SPARKS_PER_BURST: Readonly<Record<RenderTier, number>> = Object.freeze({ HIGH: 32, MEDIUM: 24, LOW: 12 });

/**
 * Smoke puffs per house tap per 3D tier (LOW = the cheap variant: fewer puffs). MFW-84: 6/5/3 → 4/3/2 (owner, 2026-11-27: "จางๆไม่เยอะมาก",
 * faint, not much). DRAFT (MFW-84 loop decision, not yet reviewed by the owner).
 */
export const CHIMNEY_SMOKE_PUFFS_PER_TAP: Readonly<Record<RenderTier, number>> = Object.freeze({ HIGH: 4, MEDIUM: 3, LOW: 2 });
/** Falling leaves per tree tap per 3D tier (LOW = the cheap variant: fewer leaves; fix round 6/5/3 → 8/6/3). DRAFT (MFW-72 loop decision, not yet reviewed by the owner). */
export const FALLING_LEAVES_PER_TAP: Readonly<Record<RenderTier, number>> = Object.freeze({ HIGH: 8, MEDIUM: 6, LOW: 3 });
/** Leaf paths precomputed per tree: enough for the largest per-tap count (technical, MFW-72). */
export const FALLING_LEAF_SLOTS = Math.max(...Object.values(FALLING_LEAVES_PER_TAP));

// Technical numbers (lead decision, MFW-49)

/**
 * Water effects per 3D tier. LOW = the AC4 cheap variant: static shore highlights only, no moving glints, no krathong ripples.
 * HIGH glintCount 10 → 6 (MFW-49 dev, the lead's first ordered cut for the SwiftShader CI frame budget; equals MEDIUM).
 * waveMotion (MFW-79): the water swells (RIVER_WATER_WAVES) drift with the flow on HIGH / MEDIUM. LOW: static wave shading
 * (written once at t = 0, no per-frame normal upload).
 */
export const WATER_EFFECT_TIERS: Readonly<
  Record<RenderTier, Readonly<{ glintCount: number; krathongRipples: boolean; waveMotion: boolean }>>
> = Object.freeze({
  HIGH: Object.freeze({ glintCount: 6, krathongRipples: true, waveMotion: true }),
  MEDIUM: Object.freeze({ glintCount: 6, krathongRipples: true, waveMotion: true }),
  LOW: Object.freeze({ glintCount: 0, krathongRipples: false, waveMotion: false }),
});

/**
 * Environment render budget per 3D tier: static riverside + water effects, main pass, the heavier NIGHT preset, no river krathongs.
 * Lead regression guard (not an owner number), MFW-49; guarded by environmentBudget.test.tsx. Krathong ripples are extra:
 * KRATHONG_RIPPLE_MAX_TRIANGLES per rendered krathong and one draw call (HIGH/MEDIUM only).
 * MFW-70 (lead override, owner review 2026-11-25 "only squares and triangles"): triangles HIGH 6 500 → 7 800 (+1 300) and
 * MEDIUM 5 850 → 7 350 (+1 500, the allowed maximum) so tree crowns and bushes can use smooth detail-1 leaf clumps (80
 * triangles each) instead of faceted 20-triangle ones. Draw calls and LOW are unchanged (LOW foliage got lighter).
 * MFW-66 (lead, stated openly; DRAFT for owner review): owner house model 812 triangles × 7 + 5 glass boxes per house =
 * +5 040 measured (7 464 / 7 104 / 4 368 → 12 504 / 12 144 / 9 408 HIGH / MEDIUM / LOW); maxTriangles +5 100 on every tier.
 * maxDrawCalls unchanged (the house now uses one draw call fewer: the door is part of the model; 20 / 20 / 19 → 19 / 19 / 18).
 * MFW-77 (lead, stated openly; DRAFT for owner review): fuller village — 9 more houses and 17 matching props from existing
 * parts. HIGH / MEDIUM keep the full owner model (872 triangles + one blob per house): measured 12 504 / 12 144 →
 * 23 160 / 22 584 (+10 656 / +10 440), maxTriangles +10 700 / +10 500. LOW draws the lite shell (308 instead of 612, owner
 * 2026-11-27 "LOW ใช้บ้านแบบเบา", HOUSE_SHELL_TIERS): measured 9 408 → 13 548 (+4 140; 18 412 with the full shell),
 * maxTriangles +4 200. Draw calls unchanged (19 / 19 / 18; the lite shell replaces the geometry of the same InstancedMesh).
 * HIGH shadow pass +7 448 caster triangles (9 × 812 + 5 trunks × 28). See docs/design/loy-krathong-look.md §20.
 * MFW-79: water ribbon 4 columns, +192 triangles per stretch; measured 23 352 / 22 776 / 13 740; budgets and draw calls unchanged
 * (look doc §21).
 * These budgets are per stretch copy (MFW-58 endless river): a frame at a stretch seam draws two copies, so the worst seam frame is
 * about twice the environment (estimate, LOW: ≈ 2 × 13.5k ≈ 27k environment triangles) plus the river krathongs.
 */
export const ENVIRONMENT_RENDER_BUDGETS: Readonly<Record<RenderTier, Readonly<{ maxDrawCalls: number; maxTriangles: number }>>> =
  Object.freeze({
    HIGH: Object.freeze({ maxDrawCalls: 21, maxTriangles: 23_600 }),
    MEDIUM: Object.freeze({ maxDrawCalls: 21, maxTriangles: 22_950 }),
    LOW: Object.freeze({ maxDrawCalls: 20, maxTriangles: 14_700 }),
  });

/**
 * Owner house model triangles per part (MFW-66, scripts/house-model.mjs output: shell 612, roof 200). Lead regression guard,
 * tests/unit/house-model-asset.test.ts HA2. liteShell: MFW-77 measured (308; HA9).
 */
export const HOUSE_MODEL_MAX_TRIANGLES = Object.freeze({ shell: 640, roof: 200, liteShell: 308 });

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

export const HOUSE_SHELL_VARIANTS = ["FULL", "LITE"] as const;
export type HouseShellVariant = (typeof HOUSE_SHELL_VARIANTS)[number];
/**
 * House shell per 3D tier. Owner decision 2026-11-27 (MFW-77): "LOW ใช้บ้านแบบเบา" — LOW draws the trim-less lite shell
 * (LOY_KRATHONG_HOUSE_MODEL.liteShell); HIGH / MEDIUM keep the full owner house model. Same draw calls on every tier.
 */
export const HOUSE_SHELL_TIERS: Readonly<Record<RenderTier, HouseShellVariant>> = Object.freeze({
  HIGH: "FULL",
  MEDIUM: "FULL",
  LOW: "LITE",
});

// Technical numbers (lead decision, MFW-50). DRAFT values.

export interface LivingWorldTier {
  /** Villagers rendered: the first N of LOY_KRATHONG_VILLAGERS. */
  readonly villagerCount: number;
  /** false = villagers stand still (the static STAND pose). */
  readonly villagersWalk: boolean;
  /** Floating light motes; 0 = none. */
  readonly moteCount: number;
  readonly lanternFlicker: boolean;
  /**
   * Idle-redraw cadence registered with the shared idle-redraw ticker (idleRedraw.ts) while villagers, motes or lanterns move,
   * ONLY in the shared world view (WORLD_EXPLORE, e.g. an empty river). null = never. In CUSTOMIZE and RITUAL the living world
   * registers nothing and advances only on frames drawn anyway (the flame-flicker cadence). When krathongs drift, RiverFlow
   * already redraws every frame and this adds nothing.
   */
  readonly idleRedrawIntervalMs: number | null;
}

/** Living world per 3D tier (backlog 9.4 AC2). LOW: fewest villagers, standing, no ambient motion, no idle redraw. DRAFT. */
export const LIVING_WORLD_TIERS: Readonly<Record<RenderTier, Readonly<LivingWorldTier>>> = Object.freeze({
  HIGH: Object.freeze({ villagerCount: 8, villagersWalk: true, moteCount: 16, lanternFlicker: true, idleRedrawIntervalMs: 50 }),
  MEDIUM: Object.freeze({ villagerCount: 5, villagersWalk: true, moteCount: 10, lanternFlicker: true, idleRedrawIntervalMs: 67 }),
  LOW: Object.freeze({ villagerCount: 2, villagersWalk: false, moteCount: 0, lanternFlicker: false, idleRedrawIntervalMs: null }),
});

/**
 * Living-world render budget per tier, main pass: villager bodies, heads, hats (one shared silhouette material), villager blob
 * shadows and motes. Lantern flicker adds no draw call. Lead regression guard (MFW-50), checked by
 * livingWorldBudget.test.tsx.
 */
export const LIVING_WORLD_RENDER_BUDGETS: Readonly<Record<RenderTier, Readonly<{ maxDrawCalls: number; maxTriangles: number }>>> =
  Object.freeze({
    HIGH: Object.freeze({ maxDrawCalls: 5, maxTriangles: 1_250 }),
    MEDIUM: Object.freeze({ maxDrawCalls: 5, maxTriangles: 750 }),
    LOW: Object.freeze({ maxDrawCalls: 4, maxTriangles: 200 }),
  });
