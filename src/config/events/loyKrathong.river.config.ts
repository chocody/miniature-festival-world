import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import type { RiverEnvironmentDefinition } from "@/core/world";
import { CANDLE_COLOR_PALETTE, LEAF_COLOR_PALETTE } from "@/config/events/loyKrathong.config";
import { KRATHONG_BASE_MODELS, KRATHONG_FLOWER_MODELS } from "@/config/krathongModel.config";
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

/**
 * ASSUMED INTERFACE for MFW-24 (river lanes): MFW-24 owns these values and keeps this name/type.
 * Every lane must stay inside LOY_KRATHONG_RIVER_CHANNEL (riverLayout.test.ts). PLACEHOLDER (spec silent): one lane on the centreline.
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = [
  { laneId: 0, controlPoints: RIVER_CENTERLINE, width: 2.4 },
];

const matte = (color: string, extra: Partial<MatteMaterialSpec> = {}): MatteMaterialSpec => ({
  color,
  roughness: 1,
  metalness: 0,
  flatShading: true,
  ...extra,
});

/** Environment palette: dark, desaturated night tones (must stay darker than the krathong, see test). PLACEHOLDER (spec silent). */
export const RIVER_BANK_MATERIAL = matte("#2c3a2f");
export const PIER_DECK_MATERIAL = matte("#56402e");

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

/** Repeated parts, one InstancedMesh each. PLACEHOLDER (spec silent) sizes/colours. */
export const RIVER_ENVIRONMENT_PARTS = {
  houseBody: {
    geometry: { kind: "box", width: 0.8, height: 0.5, depth: 0.6 },
    material: matte("#4a3628"),
    yOffset: 0.25,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: true,
  },
  houseRoof: {
    geometry: { kind: "cone", radius: 0.6, height: 0.35, radialSegments: 4 },
    material: matte("#3a2a22"),
    yOffset: 0.675,
    yawOffsetRad: Math.PI / 4,
    castShadow: true,
    receiveShadow: false,
  },
  treeTrunk: {
    geometry: { kind: "cylinder", radiusTop: 0.05, radiusBottom: 0.07, height: 0.3, radialSegments: 5 },
    material: matte("#3b2e25"),
    yOffset: 0.15,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: false,
  },
  treeCanopy: {
    geometry: { kind: "cone", radius: 0.32, height: 0.8, radialSegments: 6 },
    material: matte("#24402f"),
    yOffset: 0.7,
    yawOffsetRad: 0,
    castShadow: true,
    receiveShadow: false,
  },
  lampPost: {
    geometry: { kind: "cylinder", radiusTop: 0.025, radiusBottom: 0.025, height: 0.45, radialSegments: 5 },
    material: matte("#2f2a26"),
    yOffset: 0.225,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  lampHead: {
    geometry: { kind: "icosahedron", radius: 0.07 },
    material: matte("#5a4b32", { emissive: "#5c4c27", emissiveIntensity: 0.2 }), // emissive values: existing look-dev lamp
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
      radialSegments: 5,
    },
    material: PIER_DECK_MATERIAL,
    yOffset: 0,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
} as const satisfies Record<string, ScenePartSpec>;

export type RiverEnvironmentPartId = keyof typeof RIVER_ENVIRONMENT_PARTS;

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
