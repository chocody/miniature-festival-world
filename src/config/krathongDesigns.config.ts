import { KRATHONG_MATTE_SURFACE, type KrathongLod } from "./krathongModel.config";

/**
 * Owner-supplied krathong designs (MFW-65, backlog 13.1): one-piece GLB models, decimated offline per LOD and coloured by
 * scripts/krathong-models.mjs (docs/design/models.md). Slice 1 (MFW-65) shipped banana_leaf_01; slice 2 (MFW-76) appended the
 * other four in the owner's file order (bucket indices of the earlier designs stay stable).
 */
export const KRATHONG_DESIGN_IDS = Object.freeze(["banana_leaf_01", "lotus_bud_01", "marigold_01", "rose_candles_01", "naga_01"] as const);
export type KrathongDesignId = (typeof KRATHONG_DESIGN_IDS)[number];

/** Design of every krathong until the customizer picks one (card 14.4). Loop decision (MFW-65), DRAFT. */
export const KRATHONG_DEFAULT_DESIGN: KrathongDesignId = "banana_leaf_01";

/** Served from public/models/krathong (the committed outputs of scripts/krathong-models.mjs). */
export const KRATHONG_DESIGN_PUBLIC_PATH = "/models/krathong";

export function krathongDesignUrl(design: KrathongDesignId, lod: KrathongLod): string {
  return `${KRATHONG_DESIGN_PUBLIC_PATH}/${design}.${lod}.glb`;
}

/**
 * Model-local footprint every design is normalised to (scripts/krathong-models.designs.mjs FOOTPRINT, KA6). bottomY = the
 * banana_trunk_01 base bottom; radius = the horizontal bounding radius of the procedural DEFAULT_KRATHONG_APPEARANCE at full
 * LOD, measured by KC2 and rounded to 2 decimals. DRAFT (lead decision).
 */
export const KRATHONG_DESIGN_FOOTPRINT = Object.freeze({ radius: 1.15, bottomY: -0.18 });

/** Lead guard: most flames one design may have (capacity of the river flame bucket per krathong). */
export const KRATHONG_DESIGN_MAX_FLAMES = 16;

/** Lead guards (sized for five designs × three LODs), enforced by tests/unit/krathong-model-assets.test.ts (KA2). */
export const KRATHONG_DESIGN_ASSET_BUDGET = Object.freeze({
  maxFileBytes: 262_144,
  maxPublicTotalBytes: 1_572_864,
  maxSourceTotalBytes: 655_360,
});

/**
 * The one design-body material per canvas (vertex colours, matte). It adds one built-in program variant, shared by the hero
 * and the river (docs/perf/MFW-65.md); no texture and no custom shader.
 */
export const KRATHONG_DESIGN_BODY_MATERIAL = Object.freeze({ ...KRATHONG_MATTE_SURFACE, color: "#FFFFFF", vertexColors: true });
