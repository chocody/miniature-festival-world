import { buildPropTapTargets, type PropTapTarget } from "@/components/canvas3d/effects/propTapTargets";
import {
  LOY_KRATHONG_BUSH_CLUMPS,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_TREE_SHAPES,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_FOLIAGE_PARTS,
  type RiverFoliageParts,
} from "@/config/events/loyKrathong.river.config";
import { LOY_KRATHONG_VILLAGERS, VILLAGER_HEIGHT } from "@/config/events/loyKrathong.life.config";
import { FOLIAGE_TIERS, type RenderTier } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { alongOf } from "@/core/coordinates/endlessRiverFrame";
import {
  TREE_SHAPE_IDS,
  bladeTuftExtent,
  foliageClumpsExtent,
  getLoyKrathongEndlessRiverFrame,
  resolveRiverEnvironment,
  resolveRiversideFoliage,
  type StretchAlongExtent,
  type FoliageInstance,
  type FoliageOwnerRef,
  type InstanceTransform,
  type RiverEnvironmentLayout,
  type RiversideFoliageLayout,
} from "@/core/world";

/** Resolved once when the lazy scene chunk loads (deterministic, no I/O). */
export const LOY_KRATHONG_RIVER_LAYOUT: RiverEnvironmentLayout = resolveRiverEnvironment(LOY_KRATHONG_RIVER_ENVIRONMENT);

/** Resolved once with the layout (deterministic). */
export const LOY_KRATHONG_RIVER_FOLIAGE: RiversideFoliageLayout = resolveRiversideFoliage(
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth,
);

export interface FoliageTierView {
  readonly parts: RiverFoliageParts;
  readonly trunks: readonly InstanceTransform[];
  readonly clumps: readonly FoliageInstance[];
  readonly plants: readonly FoliageInstance[];
  readonly clumpOwners: readonly FoliageOwnerRef[]; // parallel to clumps (MFW-60 tap reactions)
  readonly plantOwners: readonly FoliageOwnerRef[]; // parallel to plants
  readonly sway: boolean; // FOLIAGE_TIERS[tier].sway; reduced motion is applied by the caller
}

/** FULL → clumps, LIGHT → clumpsLow; parts = RIVER_FOLIAGE_PARTS[variant]. Fields are the stable config / layout references. */
export function foliageForTier(foliage: RiversideFoliageLayout, tier: RenderTier): FoliageTierView {
  const { variant, sway } = FOLIAGE_TIERS[tier];
  return {
    parts: RIVER_FOLIAGE_PARTS[variant],
    trunks: foliage.trunks,
    clumps: variant === "FULL" ? foliage.clumps : foliage.clumpsLow,
    plants: foliage.plants,
    clumpOwners: variant === "FULL" ? foliage.clumpOwners : foliage.clumpLowOwners,
    plantOwners: foliage.plantOwners,
    sway,
  };
}

/** MFW-60: one tap proxy per house, tree, bush, reed and rock, derived once from the layout (positions are never stored in config). */
export const LOY_KRATHONG_PROP_TAP_TARGETS: readonly PropTapTarget[] = buildPropTapTargets(
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_RIVER_FOLIAGE,
  LOY_KRATHONG_RIVER_ENVIRONMENT.houses.map((h) => h.roof),
  RIVER_ENVIRONMENT_PARTS,
  RIVER_FOLIAGE_PARTS.FULL.riversidePlant,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION.clumpLumpAmplitude,
);

/** World position of a lamp's head (centre of the glow shell and of the tap proxy). Render-time only. */
export function lampHeadPosition(lamp: InstanceTransform, headYOffset: number): readonly [number, number, number] {
  return [lamp.position.x, lamp.position.y + headYOffset * lamp.scale, lamp.position.z];
}

/** Placement of a lamp's tap proxy (MFW-60 polish): it covers the whole lamp, post and head. Render-time only. */
export interface LampTapProxyPlacement {
  readonly position: readonly [number, number, number];
  readonly scaleY: number; // vertical stretch of the proxy (1 = round)
}

/**
 * Centre = halfway between the post base and the top of the head; the proxy (circumradius `proxyRadius`, inradius `proxyRadius ×
 * inradiusRatio`) is stretched vertically only when its inscribed sphere would not reach both ends. A tap anywhere on the post or the
 * head answers as the lamp; the horizontal disc stays ≥ MIN_TOUCH_TARGET_PX.
 */
export function lampTapProxyPlacement(
  lamp: InstanceTransform,
  head: Pick<ScenePartSpec, "yOffset" | "geometry">,
  proxyRadius: number,
  inradiusRatio: number,
): LampTapProxyPlacement {
  const headRadius = "radius" in head.geometry ? head.geometry.radius : 0;
  const halfHeight = ((head.yOffset + headRadius) * lamp.scale) / 2;
  const inradius = proxyRadius * inradiusRatio;
  return {
    position: [lamp.position.x, lamp.position.y + halfHeight, lamp.position.z],
    scaleY: Math.max(1, halfHeight / inradius),
  };
}

/** R3F gives `instanceId` for InstancedMesh hits; anything else (or out of range) falls back to lamp 0. */
export function lampIndexFromInstanceId(instanceId: number | undefined, lampCount: number): number {
  return instanceId !== undefined && Number.isInteger(instanceId) && instanceId >= 0 && instanceId < lampCount
    ? instanceId
    : 0;
}

// ---- MFW-58 endless river: what one stretch copy covers (render-time culling only) ----

/** MFW-70: crowns and bushes are clusters of leaf-clump instances; their tops come from the clump layouts. */
const CROWN_CLUMPS = [...TREE_SHAPE_IDS.map((id) => LOY_KRATHONG_TREE_SHAPES[id].clumps), LOY_KRATHONG_BUSH_CLUMPS];

/** The top of a part (or of the tallest crown built from it) above its placement origin, at scale 1. */
function partTopY(part: ScenePartSpec): number {
  const g = part.geometry;
  switch (g.kind) {
    case "icosahedron":
      return part.yOffset + g.radius * (g.scaleY ?? 1);
    case "leafClump":
      return Math.max(...CROWN_CLUMPS.map((clumps) => foliageClumpsExtent(clumps, g.lumpAmplitude).topY));
    case "trunk":
      return part.yOffset + g.height;
    case "bladeTuft":
      return part.yOffset + bladeTuftExtent(g.blades).topY;
    default:
      return part.yOffset + g.height / 2;
  }
}

let sceneryTopY: number | null = null;

/**
 * Highest world y any static scenery of a stretch reaches (moved from sceneCoverage.test.ts, MFW-58): the highest bank point + the
 * tallest environment or foliage part × the largest placement scale, or a villager's head if that is taller. Computed once.
 */
export function getRiverSceneryTopY(): number {
  if (sceneryTopY !== null) return sceneryTopY;
  const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
  const maxScale = Math.max(...[def.houses, def.trees, def.bushes, def.rocks, def.lamps].flatMap((list) => list.map((p) => p.scale)));
  const parts = [...Object.values(RIVER_ENVIRONMENT_PARTS), ...Object.values(RIVER_FOLIAGE_PARTS.FULL), ...Object.values(RIVER_FOLIAGE_PARTS.LIGHT)];
  const props = Math.max(...def.bankProfile.map((p) => p.y)) + Math.max(...parts.map((part) => partTopY(part))) * maxScale;
  const villagers = def.bankTopY + VILLAGER_HEIGHT * Math.max(...LOY_KRATHONG_VILLAGERS.map((v) => v.scale));
  sceneryTopY = Math.max(props, villagers);
  return sceneryTopY;
}

/**
 * Technical (MFW-58): world units added around every prop / villager base when measuring a stretch's along extent; riverLayout.test.ts
 * pins that it is ≥ the largest prop footprint radius (houses, crowns, bushes, reeds, villagers).
 */
export const RIVER_STRETCH_PROP_MARGIN = 1;

function computeStretchExtent(): StretchAlongExtent {
  const frame = getLoyKrathongEndlessRiverFrame();
  const layout = LOY_KRATHONG_RIVER_LAYOUT;
  let min = Infinity;
  let max = -Infinity;
  const addVertices = (positions: Float32Array, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = alongOf(frame, positions[i * 3], positions[i * 3 + 2]);
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
  };
  addVertices(layout.water.positions, layout.water.vertexCount);
  addVertices(layout.banks.left.positions, layout.banks.left.vertexCount);
  addVertices(layout.banks.right.positions, layout.banks.right.vertexCount);
  addVertices(layout.ground.strips.positions, layout.ground.strips.vertexCount);
  const foliage = LOY_KRATHONG_RIVER_FOLIAGE;
  const bases = [
    ...layout.houses,
    ...layout.trees,
    ...layout.bushes,
    ...layout.rocks,
    ...layout.lamps,
    ...foliage.trunks,
    ...foliage.clumps,
    ...foliage.clumpsLow,
    ...foliage.plants,
  ].map((t) => t.position);
  bases.push(layout.pier.deckCenter);
  for (const p of bases) {
    const a = alongOf(frame, p.x, p.z);
    min = Math.min(min, a - RIVER_STRETCH_PROP_MARGIN);
    max = Math.max(max, a + RIVER_STRETCH_PROP_MARGIN);
  }
  return Object.freeze({ min, max });
}

/**
 * MFW-58: along-axis extent of everything one stretch copy draws (water, banks, ground strips, props ± RIVER_STRETCH_PROP_MARGIN),
 * relative to the stretch start (stretch 0 = today's world). Villagers walk on the riverside paths inside the banks. Computed once.
 */
export const LOY_KRATHONG_STRETCH_EXTENT: StretchAlongExtent = computeStretchExtent();
