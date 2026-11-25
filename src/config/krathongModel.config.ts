import type { FlowerKind, KrathongBaseId, LeafFoldStyleId } from "@/config/events/loyKrathong.config";
import { LOOK_PALETTE } from "./look.config";
import type { RenderTier } from "./performance.config";

export const KRATHONG_LODS = ["full", "medium", "low"] as const;
export type KrathongLod = (typeof KRATHONG_LODS)[number];
/** Own krathong (customizer / pier): always full (MFW-69 AC4). */
export const KRATHONG_HERO_LOD: KrathongLod = "full";
/**
 * River batch LOD per 3D tier (MFW-69 AC4). PLACEHOLDER (lead decision, MFW-69): HIGH ships at "medium" until the owner's
 * on-phone check (docs/perf/MFW-69.md §4; a full 80-item HIGH zone is ≈ 285 k triangles plus shadows). One-line lever:
 * set HIGH to "full".
 */
export const KRATHONG_RIVER_LOD_BY_TIER: Readonly<Record<RenderTier, KrathongLod>> = Object.freeze({ HIGH: "medium", MEDIUM: "medium", LOW: "low" });

/**
 * Art numbers for the krathong. Units: model-local, y-up.
 * v3 (MFW-69, backlog 13.5): every `mesh` is a parametric clay mesh built by src/core/customization/krathongMeshData.ts:
 * curved, tapered, cupped banana-leaf shells with a midrib crease in two overlapping layers; petal-ring blooms around a
 * raised centre; a base with a rounded lip; a candle with wax drips; a soft teardrop flame. Each part also has lighter
 * `lod.medium` / `lod.low` variants for the river batch (per-tier LOD, KRATHONG_RIVER_LOD_BY_TIER).
 * Every v2 / v3 shape value below is DRAFT (owner reviews it from the PR screenshots); v1 values stay PLACEHOLDER (spec silent).
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
/**
 * Curved, tapered banana-leaf / petal shell (closed thin solid, MFW-69). Local frame: base at origin, spine in the YZ plane,
 * +X sideways, "front" = the inner/upper face (−n), as BladeSpec.
 */
export interface LeafShellSpec {
  readonly length: number; // spine length > 0
  readonly width: number; // max width > 0
  readonly widestAt: number; // 0 < t < 1 where the width peaks
  readonly fullness: number; // > 0; width(t) = width · sin(π·t^e)^fullness, e = ln 0.5 / ln widestAt. < 1 round, ≥ 1 pointed
  readonly baseTiltRad: number; // spine angle from +Y toward +Z at the base
  readonly bendRad: number; // spine angle change base → tip (> 0 bends the tip outward/down, < 0 curls it up)
  readonly fold: number; // ≥ 0, V fold (midrib crease): edge offset toward the front = fold · w(t) · |s|
  readonly cup: number; // ≥ 0, rounded cup: + cup · w(t) · s²
  readonly thickness: number; // > 0, shell thickness at the midrib at the widest row
  readonly rows: number; // integer ≥ 2: interior rows R (R + 1 spine segments)
  readonly columns: number; // odd integer ≥ 3: front samples across the width incl. both edges (K)
}
export interface PetalJitter {
  readonly scale: number;
  readonly yawRad: number;
  readonly tiltRad: number;
}
/** `count` copies of one petal around the axis; jitter[i % jitter.length] varies petal i (MFW-69 AC2). */
export interface PetalRingSpec {
  readonly petal: LeafShellSpec;
  readonly count: number; // integer ≥ 2
  readonly radius: number; // ≥ 0, petal-base distance from the axis
  readonly phaseRad: number;
  readonly jitter: readonly PetalJitter[]; // length ≥ 1, every scale > 0
}
export type KrathongMeshSpec =
  | { readonly kind: "lathe"; readonly profile: readonly MeshProfilePoint[]; readonly segments: number; readonly transform?: MeshTransform }
  | { readonly kind: "blade"; readonly blade: BladeSpec; readonly transform?: MeshTransform }
  | { readonly kind: "petalDisc"; readonly disc: PetalDiscSpec; readonly transform?: MeshTransform }
  | { readonly kind: "leafShell"; readonly shell: LeafShellSpec; readonly transform?: MeshTransform }
  | { readonly kind: "petalRing"; readonly ring: PetalRingSpec; readonly transform?: MeshTransform }
  | { readonly kind: "group"; readonly children: readonly KrathongMeshSpec[]; readonly transform?: MeshTransform };

/** Lighter river variants (MFW-69); `mesh` stays the full (hero) model. */
export interface KrathongMeshLodSpecs {
  readonly medium: KrathongMeshSpec;
  readonly low: KrathongMeshSpec;
}

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
  /** The full 3D model (v3, MFW-69): own krathong and the river at "full" LOD. */
  readonly mesh: KrathongMeshSpec;
  /** Lighter river variants (MFW-69). */
  readonly lod: KrathongMeshLodSpecs;
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
  /** The full 3D model (v3, MFW-69): own krathong and the river at "full" LOD. */
  readonly mesh: KrathongMeshSpec;
  /** Lighter river variants (MFW-69). */
  readonly lod: KrathongMeshLodSpecs;
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
const petalDisc = (disc: PetalDiscSpec, transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "petalDisc" as const, disc: freezeSpec({ ...disc }), ...(transform ? { transform } : {}) });
const group = (children: readonly KrathongMeshSpec[], transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "group" as const, children: Object.freeze([...children]), ...(transform ? { transform } : {}) });
const leafShell = (shell: LeafShellSpec, transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({ kind: "leafShell" as const, shell: freezeSpec({ ...shell }), ...(transform ? { transform } : {}) });
const petalRing = (ring: PetalRingSpec, transform?: MeshTransform): KrathongMeshSpec =>
  freezeSpec({
    kind: "petalRing" as const,
    ring: freezeSpec({
      ...ring,
      petal: freezeSpec({ ...ring.petal }),
      jitter: Object.freeze(ring.jitter.map((j) => freezeSpec({ ...j }))),
    }),
    ...(transform ? { transform } : {}),
  });
const lod = (medium: KrathongMeshSpec, low: KrathongMeshSpec): KrathongMeshLodSpecs => freezeSpec({ medium, low });

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

/** Tucks the outer leaf of a unit inside the base lip (DRAFT, MFW-69). */
const OUTER_LEAF_OFFSET: Vec3Tuple = vec(0, 0, -0.12);
const jit = (scale: number, yawRad: number, tiltRad: number): PetalJitter => freezeSpec({ scale, yawRad, tiltRad });
/** Per-petal scale / yaw / tilt variation of every petal ring: a hand-made irregularity (DRAFT, MFW-69 AC2). */
const PETAL_JITTER: readonly PetalJitter[] = Object.freeze([
  jit(1, 0.05, 0.06),
  jit(0.92, -0.04, -0.05),
  jit(1.05, 0.03, 0.02),
  jit(0.96, -0.06, -0.07),
  jit(1.02, 0.02, 0.05),
]);
/** One wax drip down the candle side (DRAFT, MFW-69). */
const CANDLE_DRIP: readonly MeshProfilePoint[] = Object.freeze([pt(0, -0.06), pt(0.018, -0.045), pt(0.022, 0), pt(0.016, 0.05), pt(0, 0.07)]);
const CANDLE_RADIUS = 0.125;
const DRIP_SEGMENTS = 5;
const DRIP_1_YAW_RAD = 0.6;
const DRIP_2_YAW_RAD = 2.9;

const BANANA_MEDIUM_PROFILE = [pt(0, -0.18), pt(1.0, -0.16), pt(1.14, 0), pt(1.02, 0.17), pt(0.86, 0.16), pt(0, 0.18)];
const BREAD_V2_PROFILE = [
  pt(0, -0.18 / TOY_BREAD_SQUASH),
  pt(0.95, -0.17 / TOY_BREAD_SQUASH),
  pt(1.08, -0.02 / TOY_BREAD_SQUASH),
  pt(0.9, 0.22 / TOY_BREAD_SQUASH),
  pt(0.45, 0.33 / TOY_BREAD_SQUASH),
  pt(0, 0.35 / TOY_BREAD_SQUASH),
];
const LOTUS_BASE_SMALL_BOWL = lathe(8, [pt(0, -0.16), pt(0.85, -0.12), pt(0.85, 0.14), pt(0, 0.2)]);
const LOTUS_BASE_OUTER_PETAL: LeafShellSpec = { length: 0.55, width: 0.5, widestAt: 0.5, fullness: 0.8, baseTiltRad: 1.2, bendRad: -0.5, fold: 0.12, cup: 0.3, thickness: 0.05, rows: 2, columns: 3 };
const LOTUS_BASE_INNER_PETAL: LeafShellSpec = { length: 0.38, width: 0.36, widestAt: 0.45, fullness: 1.0, baseTiltRad: 0.4, bendRad: -0.25, fold: 0.12, cup: 0.3, thickness: 0.03, rows: 3, columns: 3 };
const LOTUS_BASE_OUTER_SHIFT = xform({ translate: vec(0, -0.1, 0) });
/** The inner petals rise around the bowl rim. */
const LOTUS_BASE_INNER_LIFT = xform({ translate: vec(0, 0.08, 0) });
/** River lotus base (medium = low): the small bowl inside one lobed petal disc. */
const LOTUS_BASE_LIGHT = group([
  LOTUS_BASE_SMALL_BOWL,
  petalDisc({ petals: 8, samplesPerPetal: 3, outerRadius: 1.2, innerRadius: 0.85, roundness: 1.5, rimLift: 0.2, topHeight: 0.18, bottomDepth: 0.18, phaseRad: 0 }),
]);

export const KRATHONG_BASE_MODELS: Readonly<Record<KrathongBaseId, BaseModelSpec>> = Object.freeze({
  /** Belly, rounded lip at y .19 and an inner recess where the leaves tuck in. */
  banana_trunk_01: freezeSpec({
    geometry: cylinder(1.1, 1.2, 0.36, 16),
    mesh: lathe(16, [
      pt(0, -0.18),
      pt(0.96, -0.17),
      pt(1.12, -0.08),
      pt(1.15, 0.04),
      pt(1.09, 0.14),
      pt(0.99, 0.19),
      pt(0.86, 0.16),
      pt(0, 0.18),
    ]),
    lod: lod(lathe(12, BANANA_MEDIUM_PROFILE), lathe(8, BANANA_MEDIUM_PROFILE)),
    scale: ONE,
    localY: 0,
    topY: 0.18,
    rimY: 0.17,
    rimRadius: 0.95,
    color: LOOK_PALETTE.leafLight,
  }),
  /** A bowl inside two rings of cupped lotus petals. */
  lotus_petal_01: freezeSpec({
    geometry: cylinder(1.2, 0.9, 0.4, 8),
    mesh: group([
      lathe(12, [pt(0, -0.16), pt(0.8, -0.14), pt(0.95, 0), pt(0.85, 0.16), pt(0, 0.2)]),
      petalRing({ petal: LOTUS_BASE_OUTER_PETAL, count: 8, radius: 0.55, phaseRad: 0, jitter: PETAL_JITTER }, LOTUS_BASE_OUTER_SHIFT),
      petalRing({ petal: LOTUS_BASE_INNER_PETAL, count: 8, radius: 0.72, phaseRad: Math.PI / 8, jitter: PETAL_JITTER }, LOTUS_BASE_INNER_LIFT),
    ]),
    lod: lod(LOTUS_BASE_LIGHT, LOTUS_BASE_LIGHT),
    scale: ONE,
    localY: 0.02,
    topY: 0.22,
    rimY: 0.22,
    rimRadius: 1.0,
    color: "#E9A6B8",
  }),
  /** A bun with a rounded shoulder (lathe authored ÷ TOY_BREAD_SQUASH in y). */
  toy_bread_01: freezeSpec({
    geometry: sphere(1.1, 16, 10),
    mesh: lathe(20, [
      pt(0, -0.18 / TOY_BREAD_SQUASH),
      pt(0.95, -0.17 / TOY_BREAD_SQUASH),
      pt(1.06, -0.08 / TOY_BREAD_SQUASH),
      pt(1.08, 0.02 / TOY_BREAD_SQUASH),
      pt(0.98, 0.16 / TOY_BREAD_SQUASH),
      pt(0.78, 0.27 / TOY_BREAD_SQUASH),
      pt(0.42, 0.33 / TOY_BREAD_SQUASH),
      pt(0, 0.35 / TOY_BREAD_SQUASH),
    ]),
    lod: lod(lathe(12, BREAD_V2_PROFILE), lathe(8, BREAD_V2_PROFILE)),
    scale: vec(1, TOY_BREAD_SQUASH, 1),
    localY: 0.02,
    topY: 0.34,
    rimY: 0.24,
    rimRadius: 0.9,
    color: "#D9A066",
  }),
});

/** River detail: the same two shells with 3 columns (a folded, tapered, bent V); medium: the taller inner leaf keeps 3 rows. */
const leafLod = (outer: LeafShellSpec, inner: LeafShellSpec): KrathongMeshLodSpecs =>
  lod(
    leafUnit({ ...outer, rows: 2, columns: 3 }, { ...inner, rows: 3, columns: 3 }),
    leafUnit({ ...outer, rows: 2, columns: 3 }, { ...inner, rows: 2, columns: 3 }),
  );
/** An outer leaf flaring over the lip and a taller, more upright inner leaf on the flower-socket angle. */
function leafUnit(outer: LeafShellSpec, inner: LeafShellSpec): KrathongMeshSpec {
  return group([
    leafShell(outer, xform({ translate: OUTER_LEAF_OFFSET })),
    leafShell(inner, xform({ rotateYRad: HALF_LEAF_STEP_RAD, translate: INNER_LEAF_OFFSET })),
  ]);
}
const STYLE_01_OUTER: LeafShellSpec = { length: 0.5, width: 0.56, widestAt: 0.42, fullness: 0.8, baseTiltRad: 0.5, bendRad: 0.4, fold: 0.11, cup: 0.12, thickness: 0.02, rows: 4, columns: 5 };
const STYLE_01_INNER: LeafShellSpec = { length: 0.74, width: 0.5, widestAt: 0.4, fullness: 0.85, baseTiltRad: 0.2, bendRad: 0.45, fold: 0.12, cup: 0.12, thickness: 0.02, rows: 5, columns: 5 };
const STYLE_02_OUTER: LeafShellSpec = { length: 0.48, width: 0.62, widestAt: 0.55, fullness: 0.55, baseTiltRad: 0.55, bendRad: 0.35, fold: 0.08, cup: 0.16, thickness: 0.02, rows: 4, columns: 5 };
const STYLE_02_INNER: LeafShellSpec = { length: 0.64, width: 0.54, widestAt: 0.55, fullness: 0.55, baseTiltRad: 0.25, bendRad: 0.35, fold: 0.09, cup: 0.14, thickness: 0.02, rows: 5, columns: 5 };

export const KRATHONG_LEAF_MODELS: Readonly<Record<LeafFoldStyleId, PartModelSpec>> = Object.freeze({
  /** Pointed banana leaves. */
  style_01: freezeSpec({
    geometry: cone(0.28, 0.55, 4),
    mesh: leafUnit(STYLE_01_OUTER, STYLE_01_INNER),
    lod: leafLod(STYLE_01_OUTER, STYLE_01_INNER),
    scale: ONE,
    localY: -0.03,
  }),
  /** Rounded, broader leaves. */
  style_02: freezeSpec({
    geometry: sphere(0.26, 8, 6),
    mesh: leafUnit(STYLE_02_OUTER, STYLE_02_INNER),
    lod: leafLod(STYLE_02_OUTER, STYLE_02_INNER),
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

const FLOWER_TILT = xform({ rotateXRad: KRATHONG_FLOWER_TILT_RAD });
const tilted = (children: readonly KrathongMeshSpec[]): KrathongMeshSpec => group(children, FLOWER_TILT);

export const KRATHONG_FLOWER_MODELS: Readonly<Record<FlowerKind, FlowerModelSpec>> = Object.freeze({
  /** Ruffled: two rings of short, rounded, cupped petals. */
  marigold: freezeSpec({
    geometry: sphere(0.16, 10, 8),
    mesh: tilted([
      petalRing({
        petal: { length: 0.16, width: 0.13, widestAt: 0.72, fullness: 0.3, baseTiltRad: 1.15, bendRad: -0.5, fold: 0.06, cup: 0.4, thickness: 0.014, rows: 2, columns: 3 },
        count: 7,
        radius: 0.045,
        phaseRad: 0,
        jitter: PETAL_JITTER,
      }),
      petalRing(
        {
          petal: { length: 0.12, width: 0.11, widestAt: 0.72, fullness: 0.3, baseTiltRad: 0.6, bendRad: -0.35, fold: 0.06, cup: 0.45, thickness: 0.012, rows: 2, columns: 3 },
          count: 5,
          radius: 0.03,
          phaseRad: Math.PI / 5,
          jitter: PETAL_JITTER,
        },
        xform({ translate: vec(0, 0.02, 0) }),
      ),
    ]),
    lod: lod(
      tilted([petalDisc({ petals: 7, samplesPerPetal: 3, outerRadius: 0.2, innerRadius: 0.09, roundness: 0.5, rimLift: 0.08, topHeight: 0.02, bottomDepth: 0.03, phaseRad: 0 })]),
      tilted([petalDisc({ petals: 6, samplesPerPetal: 3, outerRadius: 0.2, innerRadius: 0.09, roundness: 0.5, rimLift: 0.07, topHeight: 0.02, bottomDepth: 0.03, phaseRad: 0 })]),
    ),
    scale: ONE,
    localY: 0.1,
    color: "#F4A300",
    centreScale: 1,
  }),
  /** Three narrow sepals, two broad petals and a cupped lip. */
  orchid: freezeSpec({
    geometry: cone(0.16, 0.22, 5),
    mesh: tilted([
      petalRing({
        petal: { length: 0.2, width: 0.075, widestAt: 0.45, fullness: 1.2, baseTiltRad: 1.35, bendRad: -0.15, fold: 0.25, cup: 0.1, thickness: 0.01, rows: 2, columns: 3 },
        count: 3,
        radius: 0.02,
        phaseRad: 0,
        jitter: PETAL_JITTER,
      }),
      petalRing({
        petal: { length: 0.18, width: 0.16, widestAt: 0.6, fullness: 0.55, baseTiltRad: 1.3, bendRad: -0.2, fold: 0.05, cup: 0.3, thickness: 0.012, rows: 3, columns: 3 },
        count: 2,
        radius: 0.02,
        phaseRad: Math.PI / 2,
        jitter: PETAL_JITTER,
      }),
      leafShell(
        { length: 0.11, width: 0.1, widestAt: 0.65, fullness: 0.5, baseTiltRad: 0.95, bendRad: -0.6, fold: 0.2, cup: 0.6, thickness: 0.012, rows: 2, columns: 3 },
        xform({ rotateYRad: Math.PI, translate: vec(0, 0.015, 0) }),
      ),
    ]),
    lod: lod(
      tilted([petalDisc({ petals: 5, samplesPerPetal: 4, outerRadius: 0.21, innerRadius: 0.07, roundness: 0.5, rimLift: 0.04, topHeight: 0.015, bottomDepth: 0.03, phaseRad: 0 })]),
      tilted([petalDisc({ petals: 5, samplesPerPetal: 3, outerRadius: 0.21, innerRadius: 0.07, roundness: 0.5, rimLift: 0.04, topHeight: 0.015, bottomDepth: 0.03, phaseRad: 0 })]),
    ),
    scale: ONE,
    localY: 0.1,
    color: "#B36BD6",
    centreScale: 0.9,
  }),
  /** Pointed petals in an upright cup. */
  lotus: freezeSpec({
    geometry: cone(0.18, 0.26, 8),
    mesh: tilted([
      petalRing({
        petal: { length: 0.2, width: 0.12, widestAt: 0.42, fullness: 1.0, baseTiltRad: 0.7, bendRad: -0.3, fold: 0.14, cup: 0.45, thickness: 0.012, rows: 2, columns: 3 },
        count: 6,
        radius: 0.045,
        phaseRad: 0,
        jitter: PETAL_JITTER,
      }),
      petalRing(
        {
          petal: { length: 0.15, width: 0.1, widestAt: 0.42, fullness: 1.0, baseTiltRad: 0.3, bendRad: -0.2, fold: 0.14, cup: 0.5, thickness: 0.01, rows: 2, columns: 3 },
          count: 4,
          radius: 0.03,
          phaseRad: Math.PI / 4,
          jitter: PETAL_JITTER,
        },
        xform({ translate: vec(0, 0.01, 0) }),
      ),
    ]),
    lod: lod(
      tilted([petalDisc({ petals: 6, samplesPerPetal: 3, outerRadius: 0.2, innerRadius: 0.08, roundness: 1.2, rimLift: 0.1, topHeight: 0.02, bottomDepth: 0.03, phaseRad: 0 })]),
      tilted([petalDisc({ petals: 6, samplesPerPetal: 2, outerRadius: 0.2, innerRadius: 0.08, roundness: 1, rimLift: 0.1, topHeight: 0.02, bottomDepth: 0.03, phaseRad: 0 })]),
    ),
    scale: ONE,
    localY: 0.08,
    color: "#F4A6C0",
    centreScale: 1.1,
  }),
});

const CENTRE_LIGHT_PROFILE = [pt(0, 0), pt(0.05, 0.02), pt(0, 0.05)];
const CENTRE_LIFT = xform({ translate: vec(0, 0.03, 0) });
/** Raised round centre of every flower (MFW-48, raised in MFW-69): its own part, material and river bucket. DRAFT. */
export const KRATHONG_FLOWER_CENTRE_MODEL: Readonly<{ geometry: PrimitiveGeometrySpec; mesh: KrathongMeshSpec; lod: KrathongMeshLodSpecs; color: string }> =
  freezeSpec({
    geometry: sphere(0.05, 6, 4),
    mesh: tilted([lathe(8, [pt(0, 0), pt(0.05, 0.015), pt(0.045, 0.05), pt(0, 0.065)], CENTRE_LIFT)]),
    lod: lod(tilted([lathe(5, CENTRE_LIGHT_PROFILE, CENTRE_LIFT)]), tilted([lathe(4, CENTRE_LIGHT_PROFILE, CENTRE_LIFT)])),
    color: LOOK_PALETTE.flowerYellow,
  });

const candleDrip = (yawRad: number, y: number, stretch: number): KrathongMeshSpec =>
  lathe(
    DRIP_SEGMENTS,
    CANDLE_DRIP,
    xform({ scale: vec(1, stretch, 0.6), rotateYRad: yawRad, translate: vec(CANDLE_RADIUS * Math.sin(yawRad), y, CANDLE_RADIUS * Math.cos(yawRad)) }),
  );
/** Candle colour comes from the appearance. Tall and slim with a rounded lip and two wax drips (DRAFT). */
export const KRATHONG_CANDLE_MODEL: PartModelSpec = freezeSpec({
  geometry: cylinder(0.12, 0.12, 0.7, 12),
  mesh: group([
    lathe(12, [pt(0, -0.35), pt(0.118, -0.35), pt(CANDLE_RADIUS, -0.32), pt(CANDLE_RADIUS, 0.26), pt(0.132, 0.31), pt(0.118, 0.35), pt(0.085, 0.345), pt(0, 0.335)]),
    candleDrip(DRIP_1_YAW_RAD, 0.24, 1.3),
    candleDrip(DRIP_2_YAW_RAD, 0.18, 0.9),
  ]),
  lod: lod(
    lathe(8, [pt(0, -0.35), pt(0.12, -0.35), pt(CANDLE_RADIUS, 0.28), pt(0.13, 0.32), pt(0.105, 0.35), pt(0, 0.34)]),
    lathe(8, [pt(0, -0.35), pt(0.12, -0.35), pt(CANDLE_RADIUS, 0.3), pt(0.1, 0.35), pt(0, 0.34)]),
  ),
  scale: ONE,
  localY: 0.35,
});

/** Soft teardrop flame (MFW-69: h .34, r .085); the emissive glow is written per light preset (and flicker) into the shared material. */
export const KRATHONG_FLAME_MODEL: ColoredPartModelSpec & { readonly emissive: string; readonly emissiveIntensity: number } = freezeSpec({
  geometry: cone(0.065, 0.26, 8),
  mesh: lathe(10, [pt(0, -0.13), pt(0.045, -0.115), pt(0.075, -0.07), pt(0.085, -0.01), pt(0.07, 0.05), pt(0.045, 0.11), pt(0.02, 0.17), pt(0, 0.21)]),
  lod: lod(
    lathe(6, [pt(0, -0.13), pt(0.06, -0.1), pt(0.085, -0.02), pt(0.06, 0.07), pt(0.03, 0.15), pt(0, 0.21)]),
    lathe(6, [pt(0, -0.13), pt(0.075, -0.06), pt(0.065, 0.06), pt(0.025, 0.15), pt(0, 0.21)]),
  ),
  scale: ONE,
  localY: 0.85,
  color: LOOK_PALETTE.flameCore,
  emissive: "#FFB35C",
  emissiveIntensity: 1,
});

const INCENSE_PROFILE = [pt(0, -0.3), pt(0.016, -0.3), pt(0.012, 0.28), pt(0, 0.3)];
const INCENSE_FULL = lathe(4, INCENSE_PROFILE);
export const KRATHONG_INCENSE_MODEL: ColoredPartModelSpec & { readonly count: number; readonly ringRadius: number } = freezeSpec({
  geometry: cylinder(0.015, 0.015, 0.6, 4),
  mesh: INCENSE_FULL,
  lod: lod(INCENSE_FULL, lathe(3, INCENSE_PROFILE)),
  scale: ONE,
  localY: 0.3,
  color: LOOK_PALETTE.doorWood,
  count: 3,
  ringRadius: 0.22,
});

/**
 * Lead guards (not product numbers): triangles of one assembled krathong, worst appearance, per LOD (MFW-69).
 * full: design 3 560 + headroom; medium: = MFW-48 worst 1 088 (a MEDIUM river is never heavier than v2); low: design 824 + headroom.
 */
export const KRATHONG_MAX_TRIANGLES_BY_LOD: Readonly<Record<KrathongLod, number>> = Object.freeze({ full: 3800, medium: 1088, low: 900 });
/** Lead guard: the flower centre rises at least this far above the petal bases (flower-local, before tilt). */
export const KRATHONG_FLOWER_CENTRE_MIN_RAISE = 0.06;
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
