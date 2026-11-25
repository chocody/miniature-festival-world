import type { FlowerKind, KrathongBaseId, LeafFoldStyleId } from "@/config/events/loyKrathong.config";
import { LOOK_PALETTE } from "./look.config";
import type { RenderTier } from "./performance.config";

/**
 * Art numbers for the krathong. Units: model-local, y-up.
 * v2 (MFW-48, backlog 9.2): every `mesh` is a parametric clay mesh (rounded lathe bases, two-layer folded banana leaves,
 * petal-disc flowers with a centre, tall candle, teardrop flame) built by src/core/customization/krathongMeshData.ts.
 * Every v2 value below is DRAFT (owner reviews it from the PR screenshots); v1 values stay PLACEHOLDER (spec silent).
 */

export type Vec3Tuple = readonly [number, number, number];

export type PrimitiveGeometrySpec =
  | { readonly type: "cylinder"; readonly radiusTop: number; readonly radiusBottom: number; readonly height: number; readonly radialSegments: number }
  | { readonly type: "sphere"; readonly radius: number; readonly widthSegments: number; readonly heightSegments: number }
  | { readonly type: "cone"; readonly radius: number; readonly height: number; readonly radialSegments: number };

/** (radius, y) profile point of a lathe, bottom → top; radius ≥ 0. */
export type MeshProfilePoint = readonly [number, number];
/** Applied in this order: scale → rotateX → rotateY → translate. Scale components must be > 0. */
export interface MeshTransform {
  readonly scale?: Vec3Tuple;
  readonly rotateXRad?: number; // +: tips +Y toward +Z (outward in a part's local frame)
  readonly rotateYRad?: number; // three convention: +Z → (sin, 0, cos)
  readonly translate?: Vec3Tuple;
}
/** Folded banana-leaf / petal blade with a diamond cross-section (closed solid). Local: base at origin, +Z outward, +X sideways. */
export interface BladeSpec {
  readonly length: number; // spine length > 0
  readonly width: number; // max width > 0
  readonly widestAt: number; // 0 < t < 1 where the width peaks
  readonly frontBulge: number; // ≥ 0, ridge toward −n (inner / upper face) at the widest row
  readonly backBulge: number; // ≥ 0, ridge toward +n; frontBulge + backBulge > 0
  readonly baseTiltRad: number; // spine angle from +Y toward +Z at the base
  readonly curlRad: number; // spine angle change base → tip (negative = tip curls back up)
  readonly segments: number; // integer ≥ 2 rows along the spine
}
/** Puffy lobed disc (flower head / lotus petals): a closed double fan. */
export interface PetalDiscSpec {
  readonly petals: number; // integer ≥ 3
  readonly samplesPerPetal: number; // integer ≥ 2 (2 = star, 4 = rounded lobes)
  readonly outerRadius: number; // petal tip radius R > innerRadius
  readonly innerRadius: number; // valley radius, 0 < innerRadius < R
  readonly roundness: number; // > 0, lobe exponent (< 1 rounder, > 1 pointier)
  readonly rimLift: number; // outline y = rimLift · r / R (cup)
  readonly topHeight: number; // y of the top centre vertex
  readonly bottomDepth: number; // bottom centre at y = −bottomDepth; topHeight + bottomDepth > 0
  readonly phaseRad: number;
}
export type KrathongMeshSpec =
  | { readonly kind: "lathe"; readonly profile: readonly MeshProfilePoint[]; readonly segments: number; readonly transform?: MeshTransform }
  | { readonly kind: "blade"; readonly blade: BladeSpec; readonly transform?: MeshTransform }
  | { readonly kind: "petalDisc"; readonly disc: PetalDiscSpec; readonly transform?: MeshTransform }
  | { readonly kind: "group"; readonly children: readonly KrathongMeshSpec[]; readonly transform?: MeshTransform };

export interface MatteMaterialSpec {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
}

/** Matte, non-glossy (backlog 3.1 AC2); same values as TOY_MATTE_MATERIALS. */
export const KRATHONG_MATTE_SURFACE = Object.freeze({ roughness: 1, metalness: 0 });

export interface BaseModelSpec {
  /** v1 primitive, kept as the 2D-fallback silhouette and the river-footprint proxy. The 3D model is `mesh`. */
  readonly geometry: PrimitiveGeometrySpec;
  /** The v2 3D model (MFW-48). */
  readonly mesh: KrathongMeshSpec;
  readonly scale: Vec3Tuple;
  /** y of the base mesh centre. */
  readonly localY: number;
  /** y of the centre-anchor (candle) plane: the top of the base. */
  readonly topY: number;
  /** y of the rim surface where leaves and flowers sit (MFW-48). */
  readonly rimY: number;
  /** Radius of the rim-socket circle and of the leaf ring. */
  readonly rimRadius: number;
  readonly color: string;
}
export interface PartModelSpec {
  /** v1 primitive, kept as the 2D-fallback silhouette and the river-footprint proxy. The 3D model is `mesh`. */
  readonly geometry: PrimitiveGeometrySpec;
  /** The v2 3D model (MFW-48). */
  readonly mesh: KrathongMeshSpec;
  readonly scale: Vec3Tuple;
  /** y offset above the base's rimY (leaves, flowers) or above the center anchor (upright parts). */
  readonly localY: number;
}
export interface ColoredPartModelSpec extends PartModelSpec {
  readonly color: string;
}
export interface FlowerModelSpec extends ColoredPartModelSpec {
  /** Uniform scale of the flower-centre part on this flower. */
  readonly centreScale: number;
}

const ONE: Vec3Tuple = Object.freeze([1, 1, 1]) as unknown as Vec3Tuple;

function freezeSpec<T extends object>(spec: T): Readonly<T> {
  return Object.freeze(spec);
}
const cylinder = (radiusTop: number, radiusBottom: number, height: number, radialSegments: number): PrimitiveGeometrySpec =>
  freezeSpec({ type: "cylinder" as const, radiusTop, radiusBottom, height, radialSegments });
const sphere = (radius: number, widthSegments: number, heightSegments: number): PrimitiveGeometrySpec =>
  freezeSpec({ type: "sphere" as const, radius, widthSegments, heightSegments });
const cone = (radius: number, height: number, radialSegments: number): PrimitiveGeometrySpec =>
  freezeSpec({ type: "cone" as const, radius, height, radialSegments });
const vec = (x: number, y: number, z: number): Vec3Tuple => Object.freeze([x, y, z]) as unknown as Vec3Tuple;

const pt = (r: number, y: number): MeshProfilePoint => Object.freeze([r, y]) as unknown as MeshProfilePoint;
const xform = (t: MeshTransform): MeshTransform => freezeSpec({ ...t });
const lathe = (segments: number, profile: readonly MeshProfilePoint[], transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "lathe" as const, profile: Object.freeze([...profile]), segments, ...(transform ? { transform } : {}) });
const blade = (spec: BladeSpec, transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "blade" as const, blade: freezeSpec({ ...spec }), ...(transform ? { transform } : {}) });
const petalDisc = (disc: PetalDiscSpec, transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "petalDisc" as const, disc: freezeSpec({ ...disc }), ...(transform ? { transform } : {}) });
const group = (children: readonly KrathongMeshSpec[], transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "group" as const, children: Object.freeze([...children]), ...(transform ? { transform } : {}) });

/** Decorative leaf ring; NOT sockets. */
export const KRATHONG_LEAF_COUNT = 8;
/** The inner blade of a leaf unit sits on the flower-socket angle (half a leaf step from the outer blade). */
const HALF_LEAF_STEP_RAD = Math.PI / KRATHONG_LEAF_COUNT;
/** Inner blade ≈ radius 0.7 for a rim ≈ 0.95 (DRAFT). */
const INNER_LEAF_OFFSET: Vec3Tuple = vec(0.27, 0, -0.3);
/** toy_bread_01 keeps its v1 part scale [1, 0.32, 1] (the 2D silhouette needs it); its lathe is authored /0.32 in y. */
const TOY_BREAD_SQUASH = 0.32;
/** Flower heads face up and outward (DRAFT). */
export const KRATHONG_FLOWER_TILT_RAD = 0.5;

export const KRATHONG_BASE_MODELS: Readonly<Record<KrathongBaseId, BaseModelSpec>> = Object.freeze({
  banana_trunk_01: freezeSpec({
    geometry: cylinder(1.1, 1.2, 0.36, 16),
    mesh: lathe(16, [pt(0, -0.18), pt(0.98, -0.17), pt(1.14, -0.06), pt(1.14, 0.08), pt(1.0, 0.17), pt(0, 0.18)]),
    scale: ONE,
    localY: 0,
    topY: 0.18,
    rimY: 0.17,
    rimRadius: 0.95,
    color: LOOK_PALETTE.leafLight,
  }),
  lotus_petal_01: freezeSpec({
    geometry: cylinder(1.2, 0.9, 0.4, 8),
    mesh: group([
      petalDisc({ petals: 8, samplesPerPetal: 4, outerRadius: 1.2, innerRadius: 0.85, roundness: 1.5, rimLift: 0.2, topHeight: 0.18, bottomDepth: 0.18, phaseRad: 0 }),
      petalDisc({ petals: 8, samplesPerPetal: 4, outerRadius: 1.0, innerRadius: 0.7, roundness: 1.5, rimLift: 0.3, topHeight: 0.2, bottomDepth: 0.08, phaseRad: Math.PI / 8 }),
    ]),
    scale: ONE,
    localY: 0.02,
    topY: 0.22,
    rimY: 0.22,
    rimRadius: 1.0,
    color: "#E9A6B8",
  }),
  toy_bread_01: freezeSpec({
    geometry: sphere(1.1, 16, 10),
    mesh: lathe(16, [
      pt(0, -0.18 / TOY_BREAD_SQUASH),
      pt(0.95, -0.17 / TOY_BREAD_SQUASH),
      pt(1.08, -0.02 / TOY_BREAD_SQUASH),
      pt(0.9, 0.22 / TOY_BREAD_SQUASH),
      pt(0.45, 0.33 / TOY_BREAD_SQUASH),
      pt(0, 0.35 / TOY_BREAD_SQUASH),
    ]),
    scale: vec(1, TOY_BREAD_SQUASH, 1),
    localY: 0.02,
    topY: 0.34,
    rimY: 0.24,
    rimRadius: 0.9,
    color: "#D9A066",
  }),
});

export const KRATHONG_LEAF_MODELS: Readonly<Record<LeafFoldStyleId, PartModelSpec>> = Object.freeze({
  /** Pointed: a short outer spike flaring out with its tip curled up, and a taller upright inner leaf. */
  style_01: freezeSpec({
    geometry: cone(0.28, 0.55, 4),
    mesh: group([
      blade({ length: 0.52, width: 0.44, widestAt: 0.4, frontBulge: 0.06, backBulge: 0.05, baseTiltRad: 0.8, curlRad: -0.6, segments: 2 }),
      blade(
        { length: 0.72, width: 0.44, widestAt: 0.4, frontBulge: 0.07, backBulge: 0.06, baseTiltRad: 0.2, curlRad: -0.2, segments: 3 },
        xform({ rotateYRad: HALF_LEAF_STEP_RAD, translate: INNER_LEAF_OFFSET }),
      ),
    ]),
    scale: ONE,
    localY: -0.03,
  }),
  /** Rounded: broader blades. */
  style_02: freezeSpec({
    geometry: sphere(0.26, 8, 6),
    mesh: group([
      blade({ length: 0.48, width: 0.48, widestAt: 0.5, frontBulge: 0.06, backBulge: 0.05, baseTiltRad: 0.8, curlRad: -0.45, segments: 3 }),
      blade(
        { length: 0.62, width: 0.48, widestAt: 0.5, frontBulge: 0.07, backBulge: 0.06, baseTiltRad: 0.2, curlRad: -0.15, segments: 3 },
        xform({ rotateYRad: HALF_LEAF_STEP_RAD, translate: INNER_LEAF_OFFSET }),
      ),
    ]),
    scale: ONE,
    localY: -0.03,
  }),
});

const LEAF_VARIATION_YAW_RAD = [0.05, -0.04, 0.02, -0.06, 0.04, -0.02, 0.06, -0.05] as const;
const LEAF_VARIATION_SCALE = [1, 0.95, 1.03, 0.97, 1.04, 0.96, 1.01, 0.98] as const;
/** Per-leaf yaw / uniform scale jitter: a hand-made irregularity at no triangle cost. DRAFT. Length = KRATHONG_LEAF_COUNT. */
export const KRATHONG_LEAF_VARIATION: readonly Readonly<{ yawRad: number; scale: number }>[] = Object.freeze(
  LEAF_VARIATION_YAW_RAD.map((yawRad, j) => Object.freeze({ yawRad, scale: LEAF_VARIATION_SCALE[j] })),
);

export const KRATHONG_FLOWER_MODELS: Readonly<Record<FlowerKind, FlowerModelSpec>> = Object.freeze({
  marigold: freezeSpec({
    geometry: sphere(0.16, 10, 8),
    mesh: group(
      [
        petalDisc({ petals: 8, samplesPerPetal: 2, outerRadius: 0.2, innerRadius: 0.13, roundness: 1, rimLift: 0.05, topHeight: 0.06, bottomDepth: 0.03, phaseRad: 0 }),
        petalDisc(
          { petals: 6, samplesPerPetal: 2, outerRadius: 0.14, innerRadius: 0.08, roundness: 1, rimLift: 0.08, topHeight: 0.08, bottomDepth: 0, phaseRad: Math.PI / 6 },
          xform({ translate: vec(0, 0.02, 0) }),
        ),
      ],
      xform({ rotateXRad: KRATHONG_FLOWER_TILT_RAD }),
    ),
    scale: ONE,
    localY: 0.1,
    color: "#F4A300",
    centreScale: 1,
  }),
  orchid: freezeSpec({
    geometry: cone(0.16, 0.22, 5),
    mesh: group(
      [petalDisc({ petals: 5, samplesPerPetal: 4, outerRadius: 0.21, innerRadius: 0.07, roundness: 0.5, rimLift: 0.03, topHeight: 0.04, bottomDepth: 0.03, phaseRad: 0 })],
      xform({ rotateXRad: KRATHONG_FLOWER_TILT_RAD }),
    ),
    scale: ONE,
    localY: 0.1,
    color: "#B36BD6",
    centreScale: 0.9,
  }),
  lotus: freezeSpec({
    geometry: cone(0.18, 0.26, 8),
    mesh: group(
      [
        petalDisc({ petals: 6, samplesPerPetal: 2, outerRadius: 0.2, innerRadius: 0.09, roundness: 1, rimLift: 0.09, topHeight: 0.05, bottomDepth: 0.03, phaseRad: 0 }),
        petalDisc(
          { petals: 5, samplesPerPetal: 2, outerRadius: 0.13, innerRadius: 0.06, roundness: 1, rimLift: 0.12, topHeight: 0.07, bottomDepth: 0, phaseRad: Math.PI / 5 },
          xform({ translate: vec(0, 0.02, 0) }),
        ),
      ],
      xform({ rotateXRad: KRATHONG_FLOWER_TILT_RAD }),
    ),
    scale: ONE,
    localY: 0.08,
    color: "#F4A6C0",
    centreScale: 1.1,
  }),
});

/** Round centre of every flower (MFW-48): its own part, material and river bucket (no vertex colours). DRAFT. */
export const KRATHONG_FLOWER_CENTRE_MODEL: Readonly<{ geometry: PrimitiveGeometrySpec; mesh: KrathongMeshSpec; color: string }> =
  freezeSpec({
    geometry: sphere(0.05, 6, 4),
    mesh: group(
      [lathe(6, [pt(0, 0), pt(0.05, 0.02), pt(0, 0.045)], xform({ translate: vec(0, 0.04, 0) }))],
      xform({ rotateXRad: KRATHONG_FLOWER_TILT_RAD }),
    ),
    color: LOOK_PALETTE.flowerYellow,
  });

/** Candle colour comes from the appearance. Tall and slim with a rounded top rim (DRAFT). */
export const KRATHONG_CANDLE_MODEL: PartModelSpec = freezeSpec({
  geometry: cylinder(0.12, 0.12, 0.7, 12),
  mesh: lathe(8, [pt(0, -0.35), pt(0.12, -0.35), pt(0.125, 0.26), pt(0.11, 0.33), pt(0.06, 0.35), pt(0, 0.34)]),
  scale: ONE,
  localY: 0.35,
});

/** Teardrop flame; the emissive glow is written per light preset (and flicker) into the shared material. */
export const KRATHONG_FLAME_MODEL: ColoredPartModelSpec & { readonly emissive: string; readonly emissiveIntensity: number } = freezeSpec({
  geometry: cone(0.065, 0.26, 8),
  mesh: lathe(8, [pt(0, -0.13), pt(0.05, -0.1), pt(0.065, -0.04), pt(0.045, 0.04), pt(0, 0.13)]),
  scale: ONE,
  localY: 0.85,
  color: LOOK_PALETTE.flameCore,
  emissive: "#FFB35C",
  emissiveIntensity: 1,
});

export const KRATHONG_INCENSE_MODEL: ColoredPartModelSpec & { readonly count: number; readonly ringRadius: number } = freezeSpec({
  geometry: cylinder(0.015, 0.015, 0.6, 4),
  mesh: lathe(4, [pt(0, -0.3), pt(0.016, -0.3), pt(0.012, 0.28), pt(0, 0.3)]),
  scale: ONE,
  localY: 0.3,
  color: LOOK_PALETTE.doorWood,
  count: 3,
  ringRadius: 0.22,
});

/** Lead guard (not a product number): triangles of one assembled krathong, worst appearance. v1 worst = 2160. */
export const KRATHONG_MAX_TRIANGLES = 1200;
/** Lead guard: WCAG contrast ratio between a flower's petal colour and its centre. */
export const KRATHONG_FLOWER_CENTRE_MIN_CONTRAST = 1.25;
/** Gentle flame flicker (backlog 9.2 AC2). DRAFT look values. Weights sum to 1, so |signal| ≤ 1. */
export const FLAME_FLICKER = Object.freeze({
  components: Object.freeze([
    Object.freeze({ hz: 1.1, weight: 0.6, phaseRad: 0 }),
    Object.freeze({ hz: 1.9, weight: 0.4, phaseRad: 1.7 }),
  ]),
  heightAmplitude: 0.08, // flame height ±8 %
  widthAmplitude: 0.04, // flame width ∓4 %
  emissiveAmplitude: 0.04, // shared flame emissive ±4 % (peak-to-peak 8 %)
});
/** WCAG 2.3.1 Three Flashes: no luminance cycle faster than 3 per second. Lead guard. */
export const FLAME_FLICKER_MAX_HZ = 3;
/** WCAG 2.3.1 general flash: a change < 10 % is not a flash. The peak-to-peak emissive swing stays below it. Lead guard. */
export const FLAME_FLICKER_MAX_EMISSIVE_SWING = 0.1;
/**
 * Demand-loop redraw cadence while the flame flickers (lead decision, perf; the scene is otherwise idle in CUSTOMIZE). DRAFT.
 * Spec lever (a) applied by the dev (lead draft 66 / 83 / 100 ms): an idle CUSTOMIZE page redrew 13–15 frames/s at about
 * 0.6–0.8 s/s of main-thread time on SwiftShader (BASE: 0 frames/s); see docs/perf/MFW-48.md.
 */
export const FLAME_FLICKER_REDRAW_INTERVAL_MS: Readonly<Record<RenderTier, number>> = Object.freeze({ HIGH: 100, MEDIUM: 125, LOW: 150 });
