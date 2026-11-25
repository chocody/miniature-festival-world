import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import type {
  BankPlacement,
  BankProfilePoint,
  HouseFacadeDefinition,
  HousePlacement,
  RiverEnvironmentDefinition,
  RiverGroundDefinition,
  RiversidePathDefinition,
} from "@/core/world";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";
import { CANDLE_COLOR_PALETTE, LEAF_COLOR_PALETTE } from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
import { LOOK_PALETTE, VILLAGE_LIGHTS } from "@/config/look.config";
import { type MatteMaterialSpec, type ScenePartSpec } from "@/config/scene.config";

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
  /** Puffy rounded bush (squashed icosahedron, smooth-shaded). DRAFT (MFW-49). */
  bush: {
    geometry: { kind: "icosahedron", radius: 0.2, detail: 0, scaleY: 0.75 },
    material: matte(LOOK_PALETTE.canopy, { flatShading: false }),
    yOffset: 0.12,
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
  treeTrunk: {
    geometry: { kind: "cylinder", radiusTop: 0.05, radiusBottom: 0.07, height: 0.3, radialSegments: 8 },
    material: matte(LOOK_PALETTE.trunk, { flatShading: false }),
    yOffset: 0.15,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: false,
  },
  treeCanopy: {
    geometry: { kind: "icosahedron", radius: 0.36, detail: 1 },
    material: matte(LOOK_PALETTE.canopy, { flatShading: false }),
    yOffset: 0.57,
    yawOffsetRad: 0,
    castShadow: true,
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
  trees: [
    { progress: 0.33, side: -1, setback: 2.5, scale: 1, yawOffsetRad: 0 },
    { progress: 0.43, side: -1, setback: 2.7, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.52, side: -1, setback: 2.4, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.62, side: -1, setback: 2.8, scale: 1, yawOffsetRad: 0 },
    { progress: 0.36, side: -1, setback: 3.6, scale: 1.15, yawOffsetRad: 0 },
    { progress: 0.35, side: 1, setback: 1.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.5, side: 1, setback: 1.9, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.6, side: 1, setback: 1.6, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.66, side: 1, setback: 2.2, scale: 1, yawOffsetRad: 0 },
  ] satisfies BankPlacement[],
  // Bushes 8 → 6 and rocks 6 → 4: the lead's third ordered cut for the SwiftShader CI frame budget (MFW-49 dev).
  bushes: [
    { progress: 0.35, side: -1, setback: 1.1, scale: 1, yawOffsetRad: 0 },
    { progress: 0.44, side: -1, setback: 1.15, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.53, side: -1, setback: 1.1, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.33, side: 1, setback: 1.4, scale: 1, yawOffsetRad: 0 },
    { progress: 0.46, side: 1, setback: 1.5, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.56, side: 1, setback: 1.35, scale: 1.1, yawOffsetRad: 0 },
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
