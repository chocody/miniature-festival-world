import type { MatteMaterialSpec, PartGeometrySpec, ScenePartSpec } from "@/config/scene.config";
import { VILLAGER_LOOK } from "@/config/look.config";
import type {
  AmbientMoteSpec,
  BlobShadowFanSpec,
  LanternFlickerSpec,
  VillagerDefinition,
  VillagerMotionSpec,
} from "@/core/world";

/**
 * MFW-50 living riverside (backlog 9.4): villagers on the MFW-49 riverside paths and ambient life. Three-free.
 * Every value is DRAFT (owner reviews from the PR screenshots); documented in docs/design/loy-krathong-look.md §12.
 */

const matte = (color: string, flatShading: boolean): MatteMaterialSpec => ({ color, roughness: 1, metalness: 0, flatShading });

/**
 * Villager silhouette material: ONE dark muted colour for every part (owner, 2026-11-25: simple silhouettes, no faces, no
 * outfit colours). Instanced parts share the smooth program (createInstancedPartMaterial), so the hat's flatness is baked
 * into its geometry. DRAFT.
 */
export const VILLAGER_MATERIAL: MatteMaterialSpec = Object.freeze(matte(VILLAGER_LOOK.silhouette, false));

/** Villager parts, one InstancedMesh each. Local units × villager scale; base = feet on the path. DRAFT. */
export const VILLAGER_PARTS = {
  // Tapered robe-like body.
  body: {
    geometry: { kind: "cylinder", radiusTop: 0.045, radiusBottom: 0.075, height: 0.2, radialSegments: 8 },
    material: VILLAGER_MATERIAL,
    yOffset: 0.1,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  // Round head (smooth detail 0 reads round at a few px, like the lamp heads).
  head: {
    geometry: { kind: "icosahedron", radius: 0.055, detail: 0 },
    material: VILLAGER_MATERIAL,
    yOffset: 0.255,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
  // Conical hat on some villagers (faceted).
  hat: {
    geometry: { kind: "cone", radius: 0.085, height: 0.05, radialSegments: 8 },
    material: matte(VILLAGER_LOOK.silhouette, true),
    yOffset: 0.32,
    yawOffsetRad: 0,
    castShadow: false,
    receiveShadow: false,
  },
} as const satisfies Record<"body" | "head" | "hat", ScenePartSpec>;

function partTop(part: ScenePartSpec): number {
  const g: PartGeometrySpec = part.geometry;
  switch (g.kind) {
    case "cylinder":
    case "cone":
    case "box":
    case "gable":
    case "roundedBox":
      return part.yOffset + g.height / 2;
    case "icosahedron":
      return part.yOffset + g.radius * (g.scaleY ?? 1);
    default:
      throw new RangeError(`villager parts use primitive kinds only, got ${g.kind}`); // MFW-70 foliage kinds are not villager parts
  }
}

/** Derived silhouette at scale 1 (AC5 layout guard, docs): top of the hat. */
export const VILLAGER_HEIGHT: number = Math.max(
  partTop(VILLAGER_PARTS.body),
  partTop(VILLAGER_PARTS.head),
  partTop(VILLAGER_PARTS.hat),
);
/** Derived silhouette at scale 1: widest part (the hat brim). */
export const VILLAGER_FOOTPRINT_RADIUS: number = Math.max(
  VILLAGER_PARTS.body.geometry.radiusBottom,
  VILLAGER_PARTS.head.geometry.radius,
  VILLAGER_PARTS.hat.geometry.radius,
);
/** Villager blob shadow radius, world units. DRAFT. */
export const VILLAGER_BLOB_SHADOW_RADIUS = 0.11;

/** Walking look: one hop and one side waddle per step; hop × villager scale. DRAFT. */
export const VILLAGER_MOTION: VillagerMotionSpec = Object.freeze({ stepLength: 0.1, hopHeight: 0.02, waddleRad: 0.08 });

export type LoyKrathongVillager = VillagerDefinition;

const villager = (v: LoyKrathongVillager): LoyKrathongVillager =>
  Object.freeze({ ...v, watch: v.watch === null ? null : Object.freeze({ ...v.watch }) });

/**
 * Ordered: a tier renders the first LIVING_WORLD_TIERS[tier].villagerCount. villagerId is the stable MFW-60 hook. Villagers on
 * the same path whose segments overlap use opposite `across`, so they pass side by side. LOW (ids 1–2) shows two watchers;
 * MEDIUM (1–5) has walkers (3, 4) and watchers (1, 2, 5). DRAFT.
 */
export const LOY_KRATHONG_VILLAGERS: readonly LoyKrathongVillager[] = Object.freeze([
  villager({ villagerId: 1, pathId: 2, fromProgress: 0.4, toProgress: 0.52, across: 0.5, phase: 0, speed: 0.22, watch: { atFraction: 0.5, durationMs: 5_000 }, hat: false, scale: 1 }),
  villager({ villagerId: 2, pathId: 1, fromProgress: 0.42, toProgress: 0.58, across: -0.5, phase: 0.35, speed: 0.2, watch: { atFraction: 0.4, durationMs: 6_000 }, hat: true, scale: 1.05 }),
  villager({ villagerId: 3, pathId: 2, fromProgress: 0.44, toProgress: 0.6, across: -0.5, phase: 0.6, speed: 0.25, watch: null, hat: true, scale: 0.95 }),
  villager({ villagerId: 4, pathId: 1, fromProgress: 0.36, toProgress: 0.5, across: 0.5, phase: 0.15, speed: 0.24, watch: null, hat: false, scale: 1 }),
  villager({ villagerId: 5, pathId: 1, fromProgress: 0.52, toProgress: 0.64, across: 0.5, phase: 0.8, speed: 0.2, watch: { atFraction: 0.6, durationMs: 4_000 }, hat: false, scale: 0.95 }),
  villager({ villagerId: 6, pathId: 2, fromProgress: 0.54, toProgress: 0.64, across: 0.5, phase: 0.45, speed: 0.2, watch: { atFraction: 0.3, durationMs: 5_000 }, hat: true, scale: 1.05 }),
  villager({ villagerId: 7, pathId: 2, fromProgress: 0.34, toProgress: 0.42, across: -0.5, phase: 0.7, speed: 0.18, watch: { atFraction: 0.5, durationMs: 7_000 }, hat: false, scale: 1 }),
  villager({ villagerId: 8, pathId: 1, fromProgress: 0.28, toProgress: 0.35, across: -0.5, phase: 0.25, speed: 0.22, watch: null, hat: false, scale: 0.95 }),
]);

/**
 * Floating light motes over the banks (never over the water; AC5 guard G4). radius 0.035 → 0.06 (MFW-50 dev): the owner asked
 * for soft points (alpha fades to 0 at the rim), which look about half their radius, so the lead's 0.035 vanished. DRAFT.
 */
export const AMBIENT_MOTES: AmbientMoteSpec = Object.freeze({
  progressFrom: 0.34,
  progressTo: 0.66,
  setbackMin: 1.3,
  setbackMax: 2.8,
  heightMin: 0.2,
  heightMax: 0.5,
  driftRadius: 0.12,
  driftPeriodMs: 9_000,
  bobAmplitude: 0.06,
  bobPeriodMs: 4_700,
  pulsePeriodMs: 2_300,
  pulseMinScale: 0.55,
  radius: 0.06,
});
/** Soft mote shape: the blob fan (alpha 1 at the centre → 0 at the rim) crossed in three planes (buildCrossedFanData). DRAFT. */
export const AMBIENT_MOTE_FAN: BlobShadowFanSpec = Object.freeze({ segments: 8, rings: 1, falloffExponent: 1 });
/**
 * Lamp-head emissive × (1 + amplitude · Σ weight·sin(2π t / period + phase)); weights sum to 1. NIGHT only (DAY lanterns are
 * off). Only the existing emissive changes: no halo (owner, 2026-11-25). DRAFT.
 */
export const LANTERN_FLICKER: LanternFlickerSpec = Object.freeze({
  amplitude: 0.12,
  components: Object.freeze([
    Object.freeze({ weight: 0.6, periodMs: 1_900, phaseRad: 0 }),
    Object.freeze({ weight: 0.4, periodMs: 3_100, phaseRad: 1.3 }),
  ]),
});
