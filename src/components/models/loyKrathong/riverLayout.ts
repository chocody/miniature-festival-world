import { buildPropTapTargets, type PropTapTarget } from "@/components/canvas3d/effects/propTapTargets";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_FOLIAGE_PARTS,
  type RiverFoliageParts,
} from "@/config/events/loyKrathong.river.config";
import { FOLIAGE_TIERS, type RenderTier } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import {
  resolveRiverEnvironment,
  resolveRiversideFoliage,
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
