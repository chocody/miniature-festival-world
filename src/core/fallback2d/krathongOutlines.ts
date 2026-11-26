import { FLAT_LATHE_SILHOUETTE_SEGMENTS } from "@/config/fallback2d.config";
import type { KrathongLod, KrathongMeshSpec, LeafShellSpec } from "@/config/krathongModel.config";
import { meshSpecFor } from "@/core/customization/krathongAssetKeys";
import {
  applyMeshTransform,
  buildBladeMeshData,
  buildLatheMeshData,
  buildLeafShellMeshData,
  buildPetalDiscMeshData,
  buildPetalRingMeshData,
  mergeMeshData,
  type KrathongMeshData,
} from "@/core/customization/krathongMeshData";
import type { KrathongGeometryKey } from "@/core/customization/types";

/**
 * 2D outlines of the krathong parts, read from the SAME vertices the 3D mesh builders make (MFW-51, invariant B: every
 * appearance key and every future shape change reaches the 2D view). Leaf / petal shells → blade outlines (edge columns, tip,
 * midrib); petal discs → their lobed rim; lathes → every vertex of a dense silhouette (convex hull drawn by the layer builder)
 * plus the top ring as a cap. Pure and three-free.
 */
export type KrathongOutlineShape =
  | {
      readonly kind: "blade";
      readonly outline: readonly number[];
      readonly tipAt: number;
      readonly vein: readonly number[];
      readonly mid: readonly [number, number];
    }
  | { readonly kind: "hull"; readonly vertices: readonly number[]; readonly cap: readonly number[] | null }
  | { readonly kind: "disc"; readonly rim: readonly number[]; readonly axis: readonly [number, number] };
export interface KrathongOutlineData {
  readonly positions: Float32Array; // part-local xyz (after the spec's own transforms)
  readonly shapes: readonly KrathongOutlineShape[]; // vertex indices into positions, spec order (depth-first)
}

const HALF = 2;
const DISC_CENTRES = 2;

function leafShellBlade(shell: LeafShellSpec, offset: number, vertexCount: number): KrathongOutlineShape {
  const R = shell.rows;
  const K = shell.columns;
  const F = (i: number, c: number) => offset + 1 + (i - 1) * K + c;
  const tip = offset + vertexCount - 1;
  const m = (K - 1) / HALF;
  const left: number[] = [];
  const right: number[] = [];
  const vein: number[] = [offset];
  for (let i = 1; i <= R; i++) {
    left.push(F(i, 0));
    right.push(F(i, K - 1));
    vein.push(F(i, m));
  }
  vein.push(tip);
  const half = Math.ceil(R / HALF);
  return Object.freeze({
    kind: "blade" as const,
    outline: Object.freeze([offset, ...left, tip, ...right.reverse()]),
    tipAt: R + 1,
    vein: Object.freeze(vein),
    mid: Object.freeze([F(half, 0), F(half, K - 1)] as const),
  });
}

function latheHull(profile: readonly (readonly [number, number])[], segments: number): KrathongOutlineShape {
  let start = 0;
  let cap: number[] | null = null;
  let capY = -Infinity;
  let capR = -Infinity;
  for (const [r, y] of profile) {
    if (r === 0) {
      start += 1;
      continue;
    }
    if (y > capY || (y === capY && r > capR)) {
      capY = y;
      capR = r;
      cap = Array.from({ length: segments }, (_, k) => start + k);
    }
    start += segments;
  }
  return Object.freeze({
    kind: "hull" as const,
    vertices: Object.freeze(Array.from({ length: start }, (_, i) => i)),
    cap: cap === null ? null : Object.freeze(cap),
  });
}

function offsetShape(shape: KrathongOutlineShape, by: number): KrathongOutlineShape {
  if (by === 0) return shape;
  const o = (list: readonly number[]) => Object.freeze(list.map((i) => i + by));
  switch (shape.kind) {
    case "blade":
      return Object.freeze({
        kind: "blade" as const,
        outline: o(shape.outline),
        tipAt: shape.tipAt,
        vein: o(shape.vein),
        mid: Object.freeze([shape.mid[0] + by, shape.mid[1] + by] as const),
      });
    case "hull":
      return Object.freeze({ kind: "hull" as const, vertices: o(shape.vertices), cap: shape.cap === null ? null : o(shape.cap) });
    case "disc":
      return Object.freeze({ kind: "disc" as const, rim: o(shape.rim), axis: Object.freeze([shape.axis[0] + by, shape.axis[1] + by] as const) });
  }
}

interface Built {
  readonly data: KrathongMeshData;
  readonly shapes: readonly KrathongOutlineShape[];
}

function build(spec: KrathongMeshSpec): Built {
  let data: KrathongMeshData;
  let shapes: KrathongOutlineShape[];
  switch (spec.kind) {
    case "leafShell": {
      data = buildLeafShellMeshData(spec.shell);
      shapes = [leafShellBlade(spec.shell, 0, data.vertexCount)];
      break;
    }
    case "petalRing": {
      data = buildPetalRingMeshData(spec.ring);
      const vp = buildLeafShellMeshData(spec.ring.petal).vertexCount;
      shapes = Array.from({ length: spec.ring.count }, (_, i) => leafShellBlade(spec.ring.petal, i * vp, vp));
      break;
    }
    case "blade": {
      data = buildBladeMeshData(spec.blade);
      const m = spec.blade.segments;
      const Rb = (i: number, k: number) => 1 + 4 * (i - 1) + k;
      const tip = data.vertexCount - 1;
      const left: number[] = [];
      const right: number[] = [];
      const vein: number[] = [0];
      for (let i = 1; i < m; i++) {
        left.push(Rb(i, 0));
        right.push(Rb(i, 2));
        vein.push(Rb(i, 1));
      }
      vein.push(tip);
      const half = Math.max(1, Math.ceil((m - 1) / HALF));
      shapes = [
        Object.freeze({
          kind: "blade" as const,
          outline: Object.freeze([0, ...left, tip, ...right.reverse()]),
          tipAt: m,
          vein: Object.freeze(vein),
          mid: Object.freeze([Rb(half, 0), Rb(half, 2)] as const),
        }),
      ];
      break;
    }
    case "petalDisc": {
      data = buildPetalDiscMeshData(spec.disc);
      shapes = [
        Object.freeze({
          kind: "disc" as const,
          rim: Object.freeze(Array.from({ length: data.vertexCount - DISC_CENTRES }, (_, i) => i + DISC_CENTRES)),
          axis: Object.freeze([0, 1] as const),
        }),
      ];
      break;
    }
    case "lathe": {
      data = buildLatheMeshData(spec.profile, FLAT_LATHE_SILHOUETTE_SEGMENTS);
      shapes = [latheHull(spec.profile, FLAT_LATHE_SILHOUETTE_SEGMENTS)];
      break;
    }
    case "group": {
      const children = spec.children.map(build);
      data = mergeMeshData(children.map((c) => c.data));
      shapes = [];
      let offset = 0;
      for (const child of children) {
        for (const s of child.shapes) shapes.push(offsetShape(s, offset));
        offset += child.data.vertexCount;
      }
      break;
    }
  }
  return { data: applyMeshTransform(data, spec.transform), shapes };
}

/** Outline data of one mesh spec (recursive, mirrors buildKrathongMeshData; lathes at FLAT_LATHE_SILHOUETTE_SEGMENTS). */
export function buildKrathongOutlineData(spec: KrathongMeshSpec): KrathongOutlineData {
  const { data, shapes } = build(spec);
  return Object.freeze({ positions: data.positions, shapes: Object.freeze(shapes) });
}

/** Finite key × LOD set: never evicted. */
const outlineCache = new Map<string, KrathongOutlineData>();

/** Cached outline data of a part key at a level of detail (unknown key → meshSpecFor throws). */
export function krathongOutlineDataFor(key: KrathongGeometryKey, lod: KrathongLod): KrathongOutlineData {
  const cacheKey = `${key}@${lod}`;
  let data = outlineCache.get(cacheKey);
  if (data === undefined) {
    data = buildKrathongOutlineData(meshSpecFor(key, lod));
    outlineCache.set(cacheKey, data);
  }
  return data;
}
