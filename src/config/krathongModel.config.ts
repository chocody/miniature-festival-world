import type { FlowerKind, KrathongBaseId, LeafFoldStyleId } from "@/config/events/loyKrathong.config";

/** Art numbers for the low-poly krathong. Every value below is PLACEHOLDER (spec silent). Units: model-local, y-up. */

export type Vec3Tuple = readonly [number, number, number];

export type PrimitiveGeometrySpec =
  | { readonly type: "cylinder"; readonly radiusTop: number; readonly radiusBottom: number; readonly height: number; readonly radialSegments: number }
  | { readonly type: "sphere"; readonly radius: number; readonly widthSegments: number; readonly heightSegments: number }
  | { readonly type: "cone"; readonly radius: number; readonly height: number; readonly radialSegments: number };

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
  readonly geometry: PrimitiveGeometrySpec;
  readonly scale: Vec3Tuple;
  /** y of the base mesh centre. */
  readonly localY: number;
  /** y of the socket plane (top of the base). */
  readonly topY: number;
  /** Radius of the rim-socket circle and of the leaf ring. */
  readonly rimRadius: number;
  readonly color: string;
}
export interface PartModelSpec {
  readonly geometry: PrimitiveGeometrySpec;
  readonly scale: Vec3Tuple;
  /** y offset above the base's topY (body parts) or above the center anchor (upright parts). */
  readonly localY: number;
}
export interface ColoredPartModelSpec extends PartModelSpec {
  readonly color: string;
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

export const KRATHONG_BASE_MODELS: Readonly<Record<KrathongBaseId, BaseModelSpec>> = Object.freeze({
  banana_trunk_01: freezeSpec({ geometry: cylinder(1.1, 1.2, 0.36, 16), scale: ONE, localY: 0, topY: 0.18, rimRadius: 0.95, color: "#C9D98F" }),
  lotus_petal_01: freezeSpec({ geometry: cylinder(1.2, 0.9, 0.4, 8), scale: ONE, localY: 0.02, topY: 0.22, rimRadius: 1.0, color: "#E9A6B8" }),
  toy_bread_01: freezeSpec({ geometry: sphere(1.1, 16, 10), scale: vec(1, 0.32, 1), localY: 0.02, topY: 0.34, rimRadius: 0.9, color: "#D9A066" }),
});

export const KRATHONG_LEAF_MODELS: Readonly<Record<LeafFoldStyleId, PartModelSpec>> = Object.freeze({
  style_01: freezeSpec({ geometry: cone(0.28, 0.55, 4), scale: ONE, localY: 0.2 }),
  style_02: freezeSpec({ geometry: sphere(0.26, 8, 6), scale: vec(1, 1.4, 0.6), localY: 0.18 }),
});

/** Decorative leaf ring; NOT sockets. */
export const KRATHONG_LEAF_COUNT = 8;

export const KRATHONG_FLOWER_MODELS: Readonly<Record<FlowerKind, ColoredPartModelSpec>> = Object.freeze({
  marigold: freezeSpec({ geometry: sphere(0.16, 10, 8), scale: vec(1, 0.8, 1), localY: 0.38, color: "#F4A300" }),
  orchid: freezeSpec({ geometry: cone(0.16, 0.22, 5), scale: ONE, localY: 0.38, color: "#B36BD6" }),
  lotus: freezeSpec({ geometry: cone(0.18, 0.26, 8), scale: ONE, localY: 0.4, color: "#F4A6C0" }),
});

/** Candle colour comes from the appearance. */
export const KRATHONG_CANDLE_MODEL: PartModelSpec = freezeSpec({
  geometry: cylinder(0.12, 0.12, 0.5, 12),
  scale: ONE,
  localY: 0.25,
});

export const KRATHONG_FLAME_MODEL: ColoredPartModelSpec & { readonly emissive: string; readonly emissiveIntensity: number } = freezeSpec({
  geometry: cone(0.06, 0.14, 8),
  scale: ONE,
  localY: 0.57,
  color: "#FFD9A0",
  emissive: "#FFB35C",
  emissiveIntensity: 1,
});

export const KRATHONG_INCENSE_MODEL: ColoredPartModelSpec & { readonly count: number; readonly ringRadius: number } = freezeSpec({
  geometry: cylinder(0.015, 0.015, 0.7, 4),
  scale: ONE,
  localY: 0.35,
  color: "#8A3B2E",
  count: 3,
  ringRadius: 0.22,
});
