import type { GrowingTreeConfig, TreeTierTemplate } from "@/core/world/growingTree";

/*
 * The one growing Christmas tree (MFW-93, plan L16 §1). Lengths are world units. Every value is DRAFT (plan §1 / R1, R9): the
 * owner approves it from the MFW-100 screenshots. Heights, trunk and groundY are multiples of 1/128 and row heightRatios are
 * multiples of 1/16 (dyadic), so every derived Y is exact and the band shift is exact (christmas.tree.config.test.ts CF2).
 * Retuning must keep growingTree.projection.test.ts (GP3, ≥ MIN_TOUCH_TARGET_PX tap separation) green. A change to any row
 * or to skirtTiersPerBand changes the lattice fingerprint and needs a new TREE_LATTICE_VERSION.
 */

/** Lattice version (part of the fingerprint). DRAFT (plan §1 / R1): the owner approves it from the MFW-100 screenshots. */
export const TREE_LATTICE_VERSION = "growing-tree-v1";

/** Most bands the tree can grow to. DRAFT (plan §1 / R9): the owner approves it from the MFW-100 screenshots. */
export const TREE_MAX_BANDS = 250;

/** Largest tier radius. DRAFT (plan §1 / R1): the owner approves it from the MFW-100 screenshots. */
export const TREE_RADIUS_MAX = 1.95;

/** Hit-proxy sphere radius of one ornament. DRAFT (plan §1 / R1): the owner approves it from the MFW-100 screenshots. */
export const TREE_ORNAMENT_HIT_RADIUS = 0.3;

/** The tier template of every skirt band (26 slots). DRAFT (plan §1 / R1): the owner approves it from the MFW-100 screenshots. */
export const CHRISTMAS_SKIRT_TIER: TreeTierTemplate = Object.freeze({
  height: 1.375,
  bottomRadius: 1.95,
  topRadius: 1.35,
  rows: Object.freeze([
    Object.freeze({ heightRatio: 0.625, count: 12, angleOffsetDeg: 15 }),
    Object.freeze({ heightRatio: 0.1875, count: 14, angleOffsetDeg: 0 }),
  ]),
});

/** Crown band (band 1), top-down; 75 slots. DRAFT (plan §1 / R1): the owner approves it from the MFW-100 screenshots. */
const CHRISTMAS_CROWN_TIERS: readonly TreeTierTemplate[] = Object.freeze([
  Object.freeze({
    height: 1,
    bottomRadius: 0.75,
    topRadius: 0.125,
    rows: Object.freeze([Object.freeze({ heightRatio: 0.375, count: 4, angleOffsetDeg: 45 })]),
  }),
  Object.freeze({
    height: 1,
    bottomRadius: 1.125,
    topRadius: 0.5,
    rows: Object.freeze([Object.freeze({ heightRatio: 0.3125, count: 7, angleOffsetDeg: 0 })]),
  }),
  Object.freeze({
    height: 1.25,
    bottomRadius: 1.5,
    topRadius: 0.875,
    rows: Object.freeze([
      Object.freeze({ heightRatio: 0.6875, count: 7, angleOffsetDeg: 25 }),
      Object.freeze({ heightRatio: 0.25, count: 9, angleOffsetDeg: 0 }),
    ]),
  }),
  Object.freeze({
    height: 1.375,
    bottomRadius: 1.75,
    topRadius: 1.125,
    rows: Object.freeze([
      Object.freeze({ heightRatio: 0.6875, count: 10, angleOffsetDeg: 18 }),
      Object.freeze({ heightRatio: 0.25, count: 12, angleOffsetDeg: 0 }),
    ]),
  }),
  CHRISTMAS_SKIRT_TIER,
]);

/**
 * The Christmas tree: crown band, then 3 skirt tiers per later band. groundY 0 and trunkHeight 0.5 are DRAFT (plan §1 / R1):
 * the owner approves them from the MFW-100 screenshots.
 */
export const CHRISTMAS_TREE: GrowingTreeConfig = Object.freeze({
  latticeVersion: TREE_LATTICE_VERSION,
  groundY: 0,
  trunkHeight: 0.5,
  crownTiers: CHRISTMAS_CROWN_TIERS,
  skirtTier: CHRISTMAS_SKIRT_TIER,
  skirtTiersPerBand: 3,
  maxBands: TREE_MAX_BANDS,
});
