import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  RIVER_FOLIAGE_PARTS,
  type RiverFoliageParts,
} from "@/config/events/loyKrathong.river.config";
import { FOLIAGE_TIERS, type RenderTier } from "@/config/performance.config";
import {
  resolveRiverEnvironment,
  resolveRiversideFoliage,
  type FoliageInstance,
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
    sway,
  };
}

/** World position of a lamp's head (centre of the glow shell and of the tap proxy). Render-time only. */
export function lampHeadPosition(lamp: InstanceTransform, headYOffset: number): readonly [number, number, number] {
  return [lamp.position.x, lamp.position.y + headYOffset * lamp.scale, lamp.position.z];
}

/** R3F gives `instanceId` for InstancedMesh hits; anything else (or out of range) falls back to lamp 0. */
export function lampIndexFromInstanceId(instanceId: number | undefined, lampCount: number): number {
  return instanceId !== undefined && Number.isInteger(instanceId) && instanceId >= 0 && instanceId < lampCount
    ? instanceId
    : 0;
}
