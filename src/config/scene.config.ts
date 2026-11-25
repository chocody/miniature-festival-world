import { LOOK_PALETTE } from "./look.config";

/** Generic toy-scene look shared by festival scenes (MFW-15 values moved here in MFW-27; spec §2.1, backlog 3.1). */

/**
 * Own-krathong candle point light (MFW-15 values). Background, ambient and key (moon/sun) lights moved to the DAY/NIGHT
 * LIGHT_PRESETS in look.config.ts (MFW-47); candle.intensity is the NIGHT base, scaled by LIGHT_PRESETS[p].candle.
 */
export const TOY_SCENE_LIGHTING = {
  candle: { color: "#ffb35c", intensity: 14, distance: 7, position: [0.15, 1.25, 0.1] as [number, number, number] },
};

/** Matte, non-glossy (backlog 3.1 AC2). */
export const TOY_MATTE_MATERIALS = {
  water: { color: LOOK_PALETTE.water, roughness: 1, metalness: 0 },
};

/**
 * Key-light shadow map edge (px) before the tier clamp min(…, TIER_BUDGETS[tier].maxTextureSize). PLACEHOLDER (spec silent).
 * Since MFW-47 the key light is the sun (DAY) or the moon (NIGHT); the name is kept.
 */
export const MOON_SHADOW_MAP_SIZE_PX = 1024;

/**
 * "Low detail" regression guard: max triangles per environment part geometry. Lead decision, MFW-27 (not a product limit);
 * raised to 320 in MFW-47 (lead decision): a bevelled roundedBox with 2 segments has 300 triangles.
 */
export const ENVIRONMENT_PART_MAX_TRIANGLES = 320;

/** three.js primitive used by one scene part (constructor args by name). */
export type PartGeometrySpec =
  | { readonly kind: "box"; readonly width: number; readonly height: number; readonly depth: number }
  | { readonly kind: "cone"; readonly radius: number; readonly height: number; readonly radialSegments: number }
  | {
      readonly kind: "cylinder";
      readonly radiusTop: number;
      readonly radiusBottom: number;
      readonly height: number;
      readonly radialSegments: number;
    }
  | { readonly kind: "icosahedron"; readonly radius: number; readonly detail?: number } // detail default 0 (20 faces)
  | {
      readonly kind: "roundedBox";
      readonly width: number;
      readonly height: number;
      readonly depth: number;
      readonly radius: number;
      readonly segments: number;
    };

/** Matte material (the literal types enforce backlog 3.1 "non-glossy"). */
export interface MatteMaterialSpec {
  readonly color: string; // "#rrggbb"
  readonly roughness: 1;
  readonly metalness: 0;
  readonly flatShading: boolean;
  readonly emissive?: string; // "#rrggbb"
  readonly emissiveIntensity?: number;
}

/** One repeated scene part, drawn as one InstancedMesh. */
export interface ScenePartSpec {
  readonly geometry: PartGeometrySpec;
  readonly material: MatteMaterialSpec;
  /** Height of the geometry centre above the instance base, in local units (multiplied by the instance scale). */
  readonly yOffset: number;
  /** Added to the instance yaw (e.g. π/4 turns a 4-sided cone into a square roof). */
  readonly yawOffsetRad: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}
