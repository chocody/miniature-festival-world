import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import type {
  BankPlacement,
  BankProfilePoint,
  FoliageClumpDefinition,
  FoliageSwayParams,
  HouseFacadeDefinition,
  HousePlacement,
  RiverEnvironmentDefinition,
  RiverGroundDefinition,
  RiversideFoliageDefinition,
  RiversidePathDefinition,
  TreePlacement,
  TreeShapeDefinition,
  TreeShapeId,
} from "@/core/world";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";
import { CANDLE_COLOR_PALETTE, LEAF_COLOR_PALETTE } from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
import { LOOK_PALETTE, VILLAGE_LIGHTS } from "@/config/look.config";
import type { FoliageVariant } from "@/config/performance.config";
import {
  type FoliageBladeSpec,
  type MatteMaterialSpec,
  type ScenePartSpec,
  type TrunkBranchSpec,
} from "@/config/scene.config";

/** Water surface height (existing: the MFW-15 disc sat at y = -0.24). */
export const RIVER_WATER_SURFACE_Y = -0.24;
/** Bank top height, slightly above the water. PLACEHOLDER (spec silent). */
export const RIVER_BANK_TOP_Y = -0.14;

/** River centreline (flat: y must be 0). Passes through the origin, where the krathong sits. PLACEHOLDER (spec silent). */
const RIVER_CENTERLINE: readonly WorldVec3[] = [
  { x: -12, y: 0, z: 0.6 },
  { x: -6, y: 0, z: -0.3 },
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0.4 },
  { x: 12, y: 0, z: -0.5 },
];

/**
 * Visible water channel. Width 3.2 → 4.8 (×1.5) in MFW-49 so the river is clearly the main feature of the view.
 * DRAFT: the owner approves the width from the MFW-49 PR screenshots (open question 38).
 */
export const LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 4.8 } as const;

/** The river's only lane id (spec §4.1 "laneId … เช่น 1"). Lead design (open question 21). */
export const LOY_KRATHONG_RIVER_LANE_ID = 1;

/**
 * Width of the single wide lane (world units); lateralOffset ±0.5 ↔ ±width/2. Lead design (open question 21), widened
 * 2.4 → 3.0 (×1.25) in MFW-49. DRAFT: the owner approves the width from the MFW-49 PR screenshots (open question 38).
 * - It is the widest lane that keeps RIVER_COLLISION_CURVATURE_MARGIN (1.1) valid on the bends: with lane 3.2 or more the
 *   inner-bend world spacing drops below 2 × RIVER_COLLISION_RADIUS (lead probe: 3.0 → 0.5752 ≥ 0.5720 pass;
 *   3.2 → 0.5708 fail; 3.6 → 0.5619 fail).
 * - The pier tip (channel half-width − overWaterLength = 2.4 − 0.6 = 1.8) stays outside the lane edge (1.5), and the lane
 *   stays inside LOY_KRATHONG_RIVER_CHANNEL (half-width 2.4).
 * - The centreline is unchanged, so progress and along-spacing of every stored SplinePathCoord keep their meaning.
 */
export const LOY_KRATHONG_RIVER_LANE_WIDTH = 3.0;

/**
 * River lanes (spec §4.1). Owner decision 21: ONE single wide lane; krathongs spread across it by lateralOffset.
 * Values owned by MFW-24; name/type shared with MFW-27. Follows the channel centreline in xz, at the water surface in y
 * (the krathong model origin, its base centre, floats on the water). Flow runs from the first control point to the last
 * (+x): progress 0 = upstream end, 1 = downstream end; the % 1 wrap happens off-screen (open question 22).
 * Guarded by riverLayout.test.ts (MFW-27) and loyKrathong.river.lanes.test.ts (MFW-24).
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = Object.freeze([
  Object.freeze({
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    width: LOY_KRATHONG_RIVER_LANE_WIDTH,
    controlPoints: Object.freeze(
      RIVER_CENTERLINE.map((p) => Object.freeze({ x: p.x, y: RIVER_WATER_SURFACE_Y, z: p.z })),
    ),
  }),
]);

const matte = (color: string, extra: Partial<MatteMaterialSpec> = {}): MatteMaterialSpec => ({
  color,
  roughness: 1,
  metalness: 0,
  flatShading: true,
  ...extra,
});

/**
 * Environment palette: the shared look v2 (LOOK_PALETTE in look.config.ts, sampled from the reference image, MFW-47).
 * Matte pastel clay; readable in both light presets (riverLayout.test.ts). DRAFT.
 */
// Banks are flat ribbons with up normals and the deck a box: flatShading false looks identical and shares the water /
// krathong shader program (one compile fewer, MFW-47 perf).
export const RIVER_BANK_MATERIAL = matte(LOOK_PALETTE.grass, { flatShading: false });
export const PIER_DECK_MATERIAL = matte(LOOK_PALETTE.woodLight, { flatShading: false });
export const PIER_PILE_MATERIAL = matte(LOOK_PALETTE.woodDark, { flatShading: false });

/**
 * Pier (ท่าน้ำ) on the near bank. PLACEHOLDER (spec silent). overWaterLength 0.35 → 0.6 and releaseInset 0.3 → 0.35 in
 * MFW-49 (the pier reaches into the wider river): DRAFT, the owner approves from the MFW-49 PR screenshots (open question 38).
 */
export const LOY_KRATHONG_PIER = {
  progress: 0.4,
  side: 1,
  onBankLength: 0.5,
  overWaterLength: 0.6,
  width: 0.5,
  deckThickness: 0.06,
  deckTopY: -0.1,
  pileBottomY: -0.34,
  releaseInset: 0.35,
  pileAlongFractions: [0.5, 1],
} as const;

/**
 * Lane location of the pier release point (LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint), clamped to the krathong body limit
 * (riverSpotLateralLimit). Three-free so the FALLBACK_2D release needs no lane math (MFW-23). Valid because the single lane shares the channel
 * centreline in xz, so the pier's channel progress is its lane progress. Pinned by loyKrathong.river.release.test.ts.
 */
const PIER_RELEASE_LATERAL_OFFSET =
  (LOY_KRATHONG_PIER.side *
    (LOY_KRATHONG_RIVER_CHANNEL.width / 2 - LOY_KRATHONG_PIER.overWaterLength - LOY_KRATHONG_PIER.releaseInset)) /
  LOY_KRATHONG_RIVER_LANE_WIDTH;
const KRATHONG_LATERAL_LIMIT = SPLINE_LATERAL_OFFSET_LIMIT - RIVER_COLLISION_RADIUS / LOY_KRATHONG_RIVER_LANE_WIDTH;

export const LOY_KRATHONG_PIER_RELEASE_SPOT = Object.freeze({
  laneId: LOY_KRATHONG_RIVER_LANE_ID,
  progress: LOY_KRATHONG_PIER.progress,
  lateralOffset: Math.min(KRATHONG_LATERAL_LIMIT, Math.max(-KRATHONG_LATERAL_LIMIT, PIER_RELEASE_LATERAL_OFFSET)),
});

/**
 * Cross-section of each bank from the water edge outward (offset = world units from the channel edge, y = absolute world
 * height). Rounded lip from under the water to the village terrace, flat terrace (lamps, path, village), then a gentle rise.
 * DRAFT (spec silent, MFW-49).
 */
export const RIVER_BANK_PROFILE: readonly BankProfilePoint[] = Object.freeze([
  Object.freeze({ offset: 0, y: -0.26 }), // below RIVER_WATER_SURFACE_Y: the shoreline is the clean water/lip intersection
  Object.freeze({ offset: 0.1, y: -0.17 }),
  Object.freeze({ offset: 0.25, y: RIVER_BANK_TOP_Y }),
  Object.freeze({ offset: 3, y: RIVER_BANK_TOP_Y }),
  Object.freeze({ offset: 5, y: 0.08 }), // last offset === bankWidth
]);

/**
 * Ground under everything so no viewport shows background; below the water so it never shows through. DRAFT (MFW-49).
 * Not the spec's full disc (MFW-49 dev, measured): SwiftShader shades the disc pixels hidden under the water and banks. The
 * ground has a hole shaped like the river + banks outline (buildGroundHoleOutline), so it overdraws nothing; holeMargin 1
 * keeps the hole edge ≥ 0.6 inside the outer bank edge, the most a camera ray can pass under that edge
 * (0.4 step / tan 33.5° camera elevation). Dev technical value. MFW-68: radius 40 (inradius 39.8 with 32 segments) covers the
 * largest view (SCENE_MAX_VIEW_SIZE / PINCH_ZOOM_MIN) from anywhere in the pan bounds ± CAMERA_PAN_MAX_OVERSHOOT at any yaw (worst
 * visible ground point r ≈ 32.5–34.2; sceneCoverage.test.ts). Technical.
 */
export const RIVER_GROUND: RiverGroundDefinition = Object.freeze({ radius: 40, y: -0.32, segments: 32, holeMargin: 1 });

/** Draw the ground last among opaque meshes (early depth rejects the covered pixels on SwiftShader). Lead decision, MFW-49. */
export const RIVER_GROUND_RENDER_ORDER = 1;

/** Door and windows in house-local units (× instance scale); local +Z is the house front. Body is 0.8 × 0.5 × 0.6. DRAFT (MFW-49). */
export const HOUSE_FACADE: HouseFacadeDefinition = Object.freeze({
  door: Object.freeze({ x: 0, y: 0.12, z: 0.31 }),
  windows: Object.freeze([Object.freeze({ x: -0.22, y: 0.3, z: 0.31 }), Object.freeze({ x: 0.22, y: 0.3, z: 0.31 })]),
});

/**
 * Riverside walking paths: MFW-50 villagers walk here (config + riversidePathPoseInto only, not drawn). See the contract in
 * docs/design/loy-krathong-look.md §11.4. Both lie on the flat village terrace, clear of every prop and the pier
 * (riverLayout.test.ts R6). DRAFT (MFW-49).
 */
export const LOY_KRATHONG_RIVERSIDE_PATHS: readonly RiversidePathDefinition[] = Object.freeze([
  Object.freeze({ pathId: 1, side: -1, setback: 0.6, halfWidth: 0.2, fromProgress: 0, toProgress: 1 }), // far bank, village side
  Object.freeze({ pathId: 2, side: 1, setback: 0.9, halfWidth: 0.2, fromProgress: 0, toProgress: 1 }), // near bank, behind the pier's bank end (0.5)
]);

/**
 * Water look geometry/motion (colours/opacity in look.config WATER_HIGHLIGHT_LOOK). DRAFT (MFW-49).
 * ripple.segments 12 → 8 (32 triangles per ring): the lead's second ordered cut for the SwiftShader CI frame budget (MFW-49 dev).
 */
export const RIVER_WATER_HIGHLIGHTS = Object.freeze({
  liftY: 0.004, // above the water surface (blob shadows use 0.006)
  shore: Object.freeze({ bandWidth: 0.35 }), // water width from each channel edge inward, alpha 1 at the edge → 0
  glint: Object.freeze({ radiusAlong: 0.32, radiusAcross: 0.05, edgeInset: 0.04, edgeSpread: 0.1, speedScale: 1.5, lifeMs: 4_000 }),
  ripple: Object.freeze({ radius: 0.42, pulseAmplitude: 0.12, periodMs: 2_400, innerRatio: 0.72, peakRatio: 0.86, segments: 8 }),
});

// ---- Foliage (MFW-70) ----
// Every value in this section is DRAFT (MFW-70, owner review from the PR screenshots) unless marked technical.

/**
 * Unit leaf clump (radius 1 × instance scale): a lumpy, smooth-shaded icosahedron. DRAFT (MFW-70).
 * HIGH / MEDIUM: detail 1 (80 triangles, 42 vertices). The lead's planned detail 0 (20 triangles, 12 vertices) still read as
 * faceted crystals in the screenshots, so the lead allowed spending more triangles here (lead override, MFW-70; see
 * ENVIRONMENT_RENDER_BUDGETS). LOW keeps detail 0 (LEAF_CLUMP_LIGHT_GEOMETRY).
 */
const LEAF_CLUMP_GEOMETRY = { kind: "leafClump", detail: 1, lumpAmplitude: 0.12, seed: 1.7 } as const;
/** LOW: the same clump at detail 0 (20 triangles). DRAFT (MFW-70). */
const LEAF_CLUMP_LIGHT_GEOMETRY = { ...LEAF_CLUMP_GEOMETRY, detail: 0 } as const;
/** Two branch stubs leaving the bent trunk; their tips end inside the crown clumps. DRAFT (MFW-70). */
const TRUNK_BRANCHES: readonly TrunkBranchSpec[] = Object.freeze([
  Object.freeze({ atHeight: 0.3, yawRad: 0.4, tiltRad: 0.85, length: 0.2, radius: 0.022, radialSegments: 4 }),
  Object.freeze({ atHeight: 0.36, yawRad: 3.5, tiltRad: 0.8, length: 0.18, radius: 0.02, radialSegments: 4 }),
]);
/** Tapered, slightly bent trunk with two branches (28 triangles). DRAFT (MFW-70). */
const TREE_TRUNK_FULL_GEOMETRY = {
  kind: "trunk",
  height: 0.5,
  radiusBottom: 0.07,
  radiusTop: 0.04,
  radialSegments: 5,
  heightSegments: 2,
  bend: 0.035,
  branches: TRUNK_BRANCHES,
} as const;
/** LOW: one height segment and one branch (14 triangles). DRAFT (MFW-70). */
const TREE_TRUNK_LIGHT_GEOMETRY = { ...TREE_TRUNK_FULL_GEOMETRY, heightSegments: 1, branches: [TRUNK_BRANCHES[0]] } as const;
/** Reed blades (scaled down = grass tufts). DRAFT (MFW-70). */
const REED_BLADES: readonly FoliageBladeSpec[] = Object.freeze([
  Object.freeze({ angleRad: 0, distance: 0.02, height: 0.34, width: 0.035, leanRad: 0.1 }),
  Object.freeze({ angleRad: 1.2, distance: 0.04, height: 0.26, width: 0.03, leanRad: 0.25 }),
  Object.freeze({ angleRad: 2.3, distance: 0.035, height: 0.3, width: 0.032, leanRad: 0.18 }),
  Object.freeze({ angleRad: 3.4, distance: 0.045, height: 0.22, width: 0.028, leanRad: 0.3 }),
  Object.freeze({ angleRad: 4.4, distance: 0.03, height: 0.28, width: 0.03, leanRad: 0.2 }),
  Object.freeze({ angleRad: 5.4, distance: 0.05, height: 0.18, width: 0.026, leanRad: 0.35 }),
]);
const RIVERSIDE_PLANT_FULL_GEOMETRY = { kind: "bladeTuft", blades: REED_BLADES, thicknessRatio: 0.4 } as const;
/** LOW: three blades. DRAFT (MFW-70). */
const RIVERSIDE_PLANT_LIGHT_GEOMETRY = {
  ...RIVERSIDE_PLANT_FULL_GEOMETRY,
  blades: [REED_BLADES[0], REED_BLADES[2], REED_BLADES[4]],
} as const;
/** Smooth matte clay; all three share the lit environment program (MFW-70 AC3). */
const TREE_TRUNK_MATERIAL = matte(LOOK_PALETTE.trunk, { flatShading: false });
const LEAF_CLUMP_MATERIAL = matte(LOOK_PALETTE.canopy, { flatShading: false });
const RIVERSIDE_PLANT_MATERIAL = matte(LOOK_PALETTE.leafLight, { flatShading: false });

/** Repeated parts, one InstancedMesh each. PLACEHOLDER (spec silent) sizes/colours; MFW-49 parts are DRAFT. */
export const RIVER_ENVIRONMENT_PARTS = {
  houseBody: {
    // 1 bevel segment (108 triangles): segments 2 (300) cost too much in the SwiftShader e2e (MFW-47 dev, see report).
    geometry: { kind: "roundedBox", width: 0.8, height: 0.5, depth: 0.6, radius: 0.06, segments: 1 },
    material: matte(LOOK_PALETTE.wallCream, { flatShading: false }),
    yOffset: 0.25,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: true,
  },
  houseRoof: {
    geometry: { kind: "cone", radius: 0.6, height: 0.35, radialSegments: 4 },
    material: matte(LOOK_PALETTE.roofTeal),
    yOffset: 0.675,
    yawOffsetRad: Math.PI / 4,
    castShadow: true,
    receiveShadow: false,
  },
  /** Terracotta gable roof (MFW-49, AC3 "different roofs and colours"). DRAFT. */
  houseRoofGable: {
    geometry: { kind: "gable", width: 0.92, depth: 0.72, height: 0.3 },
    material: matte(LOOK_PALETTE.roofTerracotta),
    yOffset: 0.65,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: false,
  },
  /** House door on the front face (HOUSE_FACADE.door). DRAFT (MFW-49). */
  houseDoor: {
    geometry: { kind: "box", width: 0.14, height: 0.24, depth: 0.02 },
    material: matte(LOOK_PALETTE.doorWood),
    yOffset: 0,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  /** Window glass; lit warm at NIGHT via VILLAGE_LIGHTS (the runtime emissive comes from the preset). DRAFT (MFW-49). */
  houseWindow: {
    geometry: { kind: "box", width: 0.12, height: 0.12, depth: 0.02 },
    material: matte(LOOK_PALETTE.waterDeep, {
      flatShading: false,
      emissive: LOOK_PALETTE.lanternGlow,
      emissiveIntensity: VILLAGE_LIGHTS.NIGHT.windowEmissiveIntensity,
    }),
    yOffset: 0,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  /** Small faceted riverside rock. DRAFT (MFW-49). */
  rock: {
    geometry: { kind: "icosahedron", radius: 0.1, detail: 0, scaleY: 0.6 },
    material: matte(LOOK_PALETTE.stone),
    yOffset: 0.03,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  /** Bent, tapered, branched trunk (MFW-70; base at y = 0). DRAFT. */
  treeTrunk: {
    geometry: TREE_TRUNK_FULL_GEOMETRY,
    material: TREE_TRUNK_MATERIAL,
    yOffset: 0,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: false,
  },
  /** One leaf clump of a tree crown or a bush (MFW-70); instance scale = clump radius. DRAFT. */
  leafClump: {
    geometry: LEAF_CLUMP_GEOMETRY,
    material: LEAF_CLUMP_MATERIAL,
    yOffset: 0,
    yawOffsetRad: 0,
    // No shadow-map pass for the clumps (MFW-70 dev, SwiftShader e2e frame budget): 33 detail-1 clumps would add 2 640
    // triangles to the HIGH shadow pass. Trees keep their soft blob shadows (RIVER_ENVIRONMENT_BLOB_SHADOWS.trees).
    castShadow: false,
    receiveShadow: false,
  },
  /** Reed / grass tuft at the water edge (MFW-70); yOffset −0.02 sinks the blade bases into the bank lip. DRAFT. */
  riversidePlant: {
    geometry: RIVERSIDE_PLANT_FULL_GEOMETRY,
    material: RIVERSIDE_PLANT_MATERIAL,
    yOffset: -0.02,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  lampPost: {
    geometry: { kind: "cylinder", radiusTop: 0.025, radiusBottom: 0.025, height: 0.45, radialSegments: 8 },
    material: matte(LOOK_PALETTE.woodDark, { flatShading: false }),
    yOffset: 0.225,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  lampHead: {
    geometry: { kind: "icosahedron", radius: 0.07, detail: 0 }, // ~7 px on screen: smooth-shaded detail 0 reads round
    material: matte(LOOK_PALETTE.flowerYellow, {
      flatShading: false,
      emissive: LOOK_PALETTE.lanternGlow,
      emissiveIntensity: VILLAGE_LIGHTS.NIGHT.lanternEmissiveIntensity, // runtime value from the light preset (MFW-49)
    }),
    yOffset: 0.5,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  pierPile: {
    geometry: {
      kind: "cylinder",
      radiusTop: 0.035,
      radiusBottom: 0.035,
      height: LOY_KRATHONG_PIER.deckTopY - LOY_KRATHONG_PIER.deckThickness - LOY_KRATHONG_PIER.pileBottomY,
      radialSegments: 8,
    },
    material: PIER_PILE_MATERIAL,
    yOffset: 0,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
} as const satisfies Record<string, ScenePartSpec>;

export type RiverEnvironmentPartId = keyof typeof RIVER_ENVIRONMENT_PARTS;

export interface RiverFoliageParts {
  readonly treeTrunk: ScenePartSpec;
  readonly leafClump: ScenePartSpec;
  readonly riversidePlant: ScenePartSpec;
}
const FULL_FOLIAGE_PARTS: RiverFoliageParts = Object.freeze({
  treeTrunk: RIVER_ENVIRONMENT_PARTS.treeTrunk,
  leafClump: RIVER_ENVIRONMENT_PARTS.leafClump,
  riversidePlant: RIVER_ENVIRONMENT_PARTS.riversidePlant,
});
/**
 * FULL = the RIVER_ENVIRONMENT_PARTS entries; LIGHT = the same specs and the SAME material objects with lighter geometry
 * (a tier drop re-creates the geometries, never the materials).
 */
export const RIVER_FOLIAGE_PARTS: Readonly<Record<FoliageVariant, RiverFoliageParts>> = Object.freeze({
  FULL: FULL_FOLIAGE_PARTS,
  LIGHT: Object.freeze({
    treeTrunk: Object.freeze({ ...FULL_FOLIAGE_PARTS.treeTrunk, geometry: TREE_TRUNK_LIGHT_GEOMETRY }),
    leafClump: Object.freeze({ ...FULL_FOLIAGE_PARTS.leafClump, geometry: LEAF_CLUMP_LIGHT_GEOMETRY }),
    riversidePlant: Object.freeze({ ...FULL_FOLIAGE_PARTS.riversidePlant, geometry: RIVERSIDE_PLANT_LIGHT_GEOMETRY }),
  }),
});

/** Tree crowns: "round" lollipop and "tall" egg shapes (reference image), clumps in tree-local units. DRAFT (MFW-70). */
export const LOY_KRATHONG_TREE_SHAPES: Readonly<Record<TreeShapeId, TreeShapeDefinition>> = Object.freeze({
  // Three smooth clumps per crown (lead override: the planned 5 / 4 detail-0 clumps read faceted; 3 detail-1 clumps fit the budget).
  round: Object.freeze({
    trunkScale: 1,
    clumps: Object.freeze([
      Object.freeze({ x: 0, y: 0.62, z: 0, radius: 0.3, yawRad: 0, keepOnLow: true }), // crown core
      Object.freeze({ x: -0.17, y: 0.55, z: 0.08, radius: 0.2, yawRad: 1.8, keepOnLow: false }), // left-low lobe
      Object.freeze({ x: 0.15, y: 0.74, z: -0.06, radius: 0.21, yawRad: 2.7, keepOnLow: true }), // right-top lobe
    ]),
  }),
  tall: Object.freeze({
    trunkScale: 0.85,
    clumps: Object.freeze([
      Object.freeze({ x: 0, y: 0.5, z: 0, radius: 0.22, yawRad: 0, keepOnLow: true }), // lower mass
      Object.freeze({ x: -0.03, y: 0.69, z: 0.04, radius: 0.2, yawRad: 1.3, keepOnLow: true }), // middle
      Object.freeze({ x: 0.05, y: 0.85, z: -0.02, radius: 0.15, yawRad: 2.6, keepOnLow: false }), // tip
    ]),
  }),
});
/** Bush = one low, lumpy clump half sunk into the bank (a mound; lead override: one detail-1 clump instead of two). DRAFT (MFW-70). */
export const LOY_KRATHONG_BUSH_CLUMPS: readonly FoliageClumpDefinition[] = Object.freeze([
  Object.freeze({ x: 0, y: 0.07, z: 0, radius: 0.17, yawRad: 0, keepOnLow: true }),
]);
/** The MFW-49 tree positions (unchanged); MFW-70 adds the crown shape and a yaw for variety (DRAFT). */
export const LOY_KRATHONG_TREES: readonly TreePlacement[] = Object.freeze([
  Object.freeze({ progress: 0.33, side: -1, setback: 2.5, scale: 1, yawOffsetRad: 0, shape: "round" }),
  Object.freeze({ progress: 0.43, side: -1, setback: 2.7, scale: 1.1, yawOffsetRad: 1.2, shape: "tall" }),
  Object.freeze({ progress: 0.52, side: -1, setback: 2.4, scale: 0.9, yawOffsetRad: 2.5, shape: "round" }),
  Object.freeze({ progress: 0.62, side: -1, setback: 2.8, scale: 1, yawOffsetRad: 0.7, shape: "tall" }),
  Object.freeze({ progress: 0.36, side: -1, setback: 3.6, scale: 1.15, yawOffsetRad: 4.1, shape: "round" }),
  Object.freeze({ progress: 0.35, side: 1, setback: 1.7, scale: 1, yawOffsetRad: 3.3, shape: "round" }),
  Object.freeze({ progress: 0.5, side: 1, setback: 1.9, scale: 1.1, yawOffsetRad: 5.0, shape: "tall" }),
  Object.freeze({ progress: 0.6, side: 1, setback: 1.6, scale: 0.9, yawOffsetRad: 1.9, shape: "round" }),
  Object.freeze({ progress: 0.66, side: 1, setback: 2.2, scale: 1, yawOffsetRad: 2.9, shape: "tall" }),
] satisfies TreePlacement[]);
/**
 * Reeds on the bank lip (1–8), then grass tufts (9–10, the same tuft at half scale). DRAFT (MFW-70). The lead's ordered cut 1
 * (grass tufts 4 → 2, planned plants 10 and 12 removed) keeps MEDIUM inside its budget with detail-1 leaf clumps.
 */
export const LOY_KRATHONG_RIVERSIDE_PLANTS: readonly BankPlacement[] = Object.freeze([
  Object.freeze({ progress: 0.3, side: 1, setback: 0.04, scale: 1, yawOffsetRad: 0 }),
  Object.freeze({ progress: 0.37, side: 1, setback: 0.05, scale: 1.1, yawOffsetRad: 1.3 }),
  Object.freeze({ progress: 0.43, side: 1, setback: 0.04, scale: 0.95, yawOffsetRad: 2.6 }),
  Object.freeze({ progress: 0.55, side: 1, setback: 0.05, scale: 1.05, yawOffsetRad: 3.9 }),
  Object.freeze({ progress: 0.64, side: 1, setback: 0.04, scale: 1, yawOffsetRad: 5.2 }),
  Object.freeze({ progress: 0.33, side: -1, setback: 0.05, scale: 1.05, yawOffsetRad: 0.6 }),
  Object.freeze({ progress: 0.46, side: -1, setback: 0.04, scale: 1.15, yawOffsetRad: 1.9 }),
  Object.freeze({ progress: 0.56, side: -1, setback: 0.05, scale: 0.95, yawOffsetRad: 3.2 }),
  Object.freeze({ progress: 0.38, side: 1, setback: 1.25, scale: 0.5, yawOffsetRad: 0.4 }),
  Object.freeze({ progress: 0.505, side: -1, setback: 0.95, scale: 0.5, yawOffsetRad: 4.4 }),
] satisfies BankPlacement[]);

/** Gentle sway (MFW-70 AC4), DRAFT; phaseStepRad technical (golden angle: neighbouring owners never sway in step). */
export const RIVER_FOLIAGE_SWAY = Object.freeze({
  leafClump: Object.freeze({ shear: 0.03, periodMs: 4_200, windDirX: 1, windDirZ: 0 }) satisfies FoliageSwayParams,
  riversidePlant: Object.freeze({ shear: 0.08, periodMs: 2_800, windDirX: 1, windDirZ: 0 }) satisfies FoliageSwayParams,
  phaseStepRad: Math.PI * (3 - Math.sqrt(5)),
});

/** Foliage of the riverside (MFW-70), resolved by LOY_KRATHONG_RIVER_FOLIAGE in riverLayout.ts. */
export const LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION: RiversideFoliageDefinition = Object.freeze({
  trees: LOY_KRATHONG_TREES,
  treeShapes: LOY_KRATHONG_TREE_SHAPES,
  bushClumps: LOY_KRATHONG_BUSH_CLUMPS,
  plants: LOY_KRATHONG_RIVERSIDE_PLANTS,
  clumpLumpAmplitude: LEAF_CLUMP_GEOMETRY.lumpAmplitude,
  swayPhaseStepRad: RIVER_FOLIAGE_SWAY.phaseStepRad,
});

/**
 * Soft blob shadow ellipses under the static props (MFW-47). DRAFT. Radii are local units, multiplied by the instance
 * scale; X runs along the part's local x after the instance yaw.
 */
export const RIVER_ENVIRONMENT_BLOB_SHADOWS = Object.freeze({
  houses: Object.freeze({ radiusX: 0.56, radiusZ: 0.44 }),
  trees: Object.freeze({ radiusX: 0.42, radiusZ: 0.42 }),
  lamps: Object.freeze({ radiusX: 0.1, radiusZ: 0.1 }),
});

/**
 * Full environment definition. setback = world units from the water edge. Placements are DRAFT (spec silent; MFW-49 village
 * v2, guarded by riverLayout.test.ts). Near-bank houses turn their front (yawOffsetRad π) to the camera and the path.
 */
export const LOY_KRATHONG_RIVER_ENVIRONMENT: RiverEnvironmentDefinition = {
  channel: LOY_KRATHONG_RIVER_CHANNEL,
  waterSurfaceY: RIVER_WATER_SURFACE_Y,
  bankTopY: RIVER_BANK_TOP_Y,
  bankWidth: 5, // DRAFT (MFW-49; was 4)
  waterUnderlap: 0.3,
  ribbonSegments: 48, // 64 → 48: the lead's fourth ordered cut for the SwiftShader CI frame budget (MFW-49 dev)
  bankProfile: RIVER_BANK_PROFILE,
  ground: RIVER_GROUND,
  houses: [
    { progress: 0.31, side: -1, setback: 1.45, scale: 1, yawOffsetRad: 0, roof: "pyramid" },
    { progress: 0.39, side: -1, setback: 1.45, scale: 1.1, yawOffsetRad: 0, roof: "gable" },
    { progress: 0.48, side: -1, setback: 1.45, scale: 0.95, yawOffsetRad: 0, roof: "pyramid" },
    { progress: 0.57, side: -1, setback: 1.45, scale: 1.05, yawOffsetRad: 0, roof: "gable" },
    { progress: 0.66, side: -1, setback: 1.45, scale: 1, yawOffsetRad: 0, roof: "pyramid" },
    { progress: 0.29, side: 1, setback: 2.6, scale: 1, yawOffsetRad: Math.PI, roof: "gable" },
    { progress: 0.71, side: 1, setback: 2.6, scale: 1, yawOffsetRad: Math.PI, roof: "gable" },
  ] satisfies HousePlacement[],
  houseFacade: HOUSE_FACADE,
  trees: LOY_KRATHONG_TREES, // MFW-70: same positions, plus crown shape and yaw

  // Bushes 8 → 6 and rocks 6 → 4: the lead's third ordered cut for the SwiftShader CI frame budget (MFW-49 dev).
  bushes: [
    // MFW-70: yaw offsets for clump variety (DRAFT); positions unchanged.
    { progress: 0.35, side: -1, setback: 1.1, scale: 1, yawOffsetRad: 0 },
    { progress: 0.44, side: -1, setback: 1.15, scale: 0.9, yawOffsetRad: 1.7 },
    { progress: 0.53, side: -1, setback: 1.1, scale: 1.1, yawOffsetRad: 3.1 },
    { progress: 0.33, side: 1, setback: 1.4, scale: 1, yawOffsetRad: 0.8 },
    { progress: 0.46, side: 1, setback: 1.5, scale: 0.9, yawOffsetRad: 2.4 },
    { progress: 0.56, side: 1, setback: 1.35, scale: 1.1, yawOffsetRad: 4.6 },
  ] satisfies BankPlacement[],
  rocks: [
    { progress: 0.37, side: -1, setback: 0.12, scale: 1, yawOffsetRad: 0 },
    { progress: 0.32, side: 1, setback: 0.12, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.47, side: 1, setback: 0.13, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.58, side: 1, setback: 0.12, scale: 1, yawOffsetRad: 0 },
  ] satisfies BankPlacement[],
  lamps: [
    { progress: 0.34, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.45, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.53, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.62, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.35, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.43, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.51, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.6, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
  ] satisfies BankPlacement[],
  pier: LOY_KRATHONG_PIER,
  paths: LOY_KRATHONG_RIVERSIDE_PATHS,
};

/**
 * Krathong body colours the environment must stay darker than (AC2): MFW-19 palettes (base models, leaves,
 * flowers, candle colours; not the incense stick).
 */
export const LOY_KRATHONG_PROMINENCE_REFERENCE_COLORS: readonly string[] = [
  ...Object.values(KRATHONG_BASE_MODELS).map((base) => base.color),
  ...LEAF_COLOR_PALETTE,
  ...Object.values(KRATHONG_FLOWER_MODELS).map((flower) => flower.color),
  ...CANDLE_COLOR_PALETTE,
];
