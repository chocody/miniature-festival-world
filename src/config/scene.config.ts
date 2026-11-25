import { LOOK_PALETTE } from "./look.config";
import { KRATHONG_MODEL_FOOTPRINT_RADIUS } from "./riverFlow.config";

/** Generic toy-scene look shared by festival scenes (MFW-15 values moved here in MFW-27; spec §2.1, backlog 3.1). */

/**
 * Own-krathong candle point light in krathong MODEL units (pose scale 1). OwnKrathong multiplies distance by the pose scale and
 * intensity by its square, so the glow looks the same on the 0.22-scaled river krathong as in CUSTOMIZE (MFW-67).
 * intensity: NIGHT base (× LIGHT_PRESETS[p].candle.intensityScale), DRAFT 1.0 (was 14: it clipped into a yellow disc), kept below
 * CANDLE_MAX_PEAK_RADIANCE by look.config.test.ts; distance: 2 × the footprint radius, so the warm light fades out smoothly just past
 * the krathong; decay 2 = physical inverse square (three's default, stated so the guard's formula holds).
 * Background, ambient and key (moon/sun) lights live in the DAY/NIGHT LIGHT_PRESETS in look.config.ts (MFW-47).
 */
export const TOY_SCENE_LIGHTING = {
  candle: {
    color: "#ffb35c",
    intensity: 1.0,
    distance: 2 * KRATHONG_MODEL_FOOTPRINT_RADIUS,
    decay: 2,
    position: [0.15, 1.25, 0.1] as [number, number, number],
  },
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
 * 128 since MFW-47: the largest shipped part is the bevelled house body (roundedBox, 1 segment = 108 triangles), plus
 * small headroom.
 */
export const ENVIRONMENT_PART_MAX_TRIANGLES = 128;

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
  // detail default 0 (20 faces); scaleY = vertical squash, default 1 (MFW-49 bushes and rocks)
  | { readonly kind: "icosahedron"; readonly radius: number; readonly detail?: number; readonly scaleY?: number }
  // Triangular prism (MFW-49 gable roof): ridge along local x, base at y = -height/2, ridge at +height/2.
  | { readonly kind: "gable"; readonly width: number; readonly depth: number; readonly height: number }
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
