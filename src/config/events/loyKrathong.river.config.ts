import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import type { RiverEnvironmentDefinition } from "@/core/world";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";
import { CANDLE_COLOR_PALETTE, LEAF_COLOR_PALETTE } from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
import { LOOK_PALETTE } from "@/config/look.config";
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

/** Visible water channel. Width PLACEHOLDER (spec silent). */
export const LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 3.2 } as const;

/** The river's only lane id (spec §4.1 "laneId … เช่น 1"). Lead design (open question 21). */
export const LOY_KRATHONG_RIVER_LANE_ID = 1;

/**
 * Width of the single wide lane (world units); lateralOffset ±0.5 ↔ ±width/2. Lead design (open question 21): the widest
 * centred lane that keeps the pier tip (channel lateral half-width − overWaterLength = 1.25) outside the lane with a margin,
 * and stays inside LOY_KRATHONG_RIVER_CHANNEL (half-width 1.6).
 */
export const LOY_KRATHONG_RIVER_LANE_WIDTH = 2.4;

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

/** Pier (ท่าน้ำ) on the near bank. PLACEHOLDER (spec silent). */
export const LOY_KRATHONG_PIER = {
  progress: 0.4,
  side: 1,
  onBankLength: 0.5,
  overWaterLength: 0.35,
  width: 0.5,
  deckThickness: 0.06,
  deckTopY: -0.1,
  pileBottomY: -0.34,
  releaseInset: 0.3,
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

/** Repeated parts, one InstancedMesh each. PLACEHOLDER (spec silent) sizes/colours. */
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
      emissiveIntensity: 0.35,
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

/** Full environment definition. Placements are PLACEHOLDER (spec silent). setback = world units from the water edge. */
export const LOY_KRATHONG_RIVER_ENVIRONMENT: RiverEnvironmentDefinition = {
  channel: LOY_KRATHONG_RIVER_CHANNEL,
  waterSurfaceY: RIVER_WATER_SURFACE_Y,
  bankTopY: RIVER_BANK_TOP_Y,
  bankWidth: 4,
  waterUnderlap: 0.3,
  ribbonSegments: 64,
  houses: [
    { progress: 0.36, side: -1, setback: 0.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.45, side: -1, setback: 0.7, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.56, side: -1, setback: 0.7, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.66, side: -1, setback: 0.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.3, side: 1, setback: 2.6, scale: 1, yawOffsetRad: 0 },
    { progress: 0.7, side: 1, setback: 2.6, scale: 1, yawOffsetRad: 0 },
  ],
  trees: [
    { progress: 0.33, side: -1, setback: 1.5, scale: 1, yawOffsetRad: 0 },
    { progress: 0.4, side: -1, setback: 1.7, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.5, side: -1, setback: 1.4, scale: 0.9, yawOffsetRad: 0 },
    { progress: 0.61, side: -1, setback: 1.7, scale: 1, yawOffsetRad: 0 },
    { progress: 0.36, side: 1, setback: 2.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.55, side: 1, setback: 2.4, scale: 1.1, yawOffsetRad: 0 },
    { progress: 0.64, side: 1, setback: 2, scale: 0.9, yawOffsetRad: 0 },
  ],
  lamps: [
    { progress: 0.44, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.52, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.6, side: 1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.41, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.5, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
    { progress: 0.6, side: -1, setback: 0.2, scale: 1, yawOffsetRad: 0 },
  ],
  pier: LOY_KRATHONG_PIER,
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
