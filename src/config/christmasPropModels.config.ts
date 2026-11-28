import { CHRISTMAS_MODEL_PUBLIC_PATH } from "./ornamentModels.config";

/**
 * Owner-made Christmas scene props (MFW-124, backlog 16.38): the snowman and the gift pile. One-piece vertex-colour GLBs with
 * medium and low LODs only and no hook, built by scripts/christmas-models.mjs into public/models/christmas
 * (docs/design/models.md §13). They share the model-local frame (bbox centre at the origin, bounding radius
 * ORNAMENT_MODEL_RADIUS) and CHRISTMAS_MODEL_ASSET_BUDGET; their world scale and anchor belong to 16.19. Three-free.
 */
export const CHRISTMAS_PROP_IDS = Object.freeze(["snowman_01", "gift_pile_01"] as const);
export type ChristmasPropId = (typeof CHRISTMAS_PROP_IDS)[number];

export const CHRISTMAS_PROP_LODS = Object.freeze(["medium", "low"] as const);
export type ChristmasPropLod = (typeof CHRISTMAS_PROP_LODS)[number];

/** DRAFT (backlog 16.38): medium = HIGH / MEDIUM, low = LOW; 16.19 picks per tier. */
export const CHRISTMAS_PROP_MAX_TRIANGLES_BY_LOD: Readonly<Record<ChristmasPropLod, number>> = Object.freeze({ medium: 1500, low: 600 });

export function christmasPropUrl(prop: ChristmasPropId, lod: ChristmasPropLod): string {
  return `${CHRISTMAS_MODEL_PUBLIC_PATH}/${prop}.${lod}.glb`;
}
