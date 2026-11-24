/** Generic toy-scene look shared by festival scenes (MFW-15 values moved here in MFW-27; spec §2.1, backlog 3.1). */

export const TOY_SCENE_LIGHTING = {
  background: "#101a32",
  ambient: { color: "#8499c5", intensity: 0.75 },
  moon: { color: "#bdceff", intensity: 1.15, position: [-4, 7, 3] as [number, number, number] },
  candle: { color: "#ffb35c", intensity: 14, distance: 7, position: [0.15, 1.25, 0.1] as [number, number, number] },
};

/** Matte, non-glossy (backlog 3.1 AC2). */
export const TOY_MATTE_MATERIALS = {
  water: { color: "#243d65", roughness: 1, metalness: 0 },
};

/** Moon shadow map edge (px) before the tier clamp min(…, TIER_BUDGETS[tier].maxTextureSize). PLACEHOLDER (spec silent). */
export const MOON_SHADOW_MAP_SIZE_PX = 1024;

/** "Low detail" regression guard: max triangles per environment part geometry. Lead decision, MFW-27 (not a product limit). */
export const ENVIRONMENT_PART_MAX_TRIANGLES = 32;

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
  | { readonly kind: "icosahedron"; readonly radius: number }; // detail 0 (20 faces)

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
