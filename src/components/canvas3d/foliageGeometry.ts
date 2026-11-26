import { BufferGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { PartGeometrySpec } from "@/config/scene.config";

/** Lump frequency of the leaf clump's radial noise (technical, MFW-70). */
export const LEAF_CLUMP_LUMP_FREQUENCY = 3;
/** Position tolerance when welding the icosahedron's duplicated vertices (technical, MFW-70). */
export const LEAF_CLUMP_MERGE_TOLERANCE = 1e-4;

export type LeafClumpGeometrySpec = Extract<PartGeometrySpec, { kind: "leafClump" }>;
export type TrunkGeometrySpec = Extract<PartGeometrySpec, { kind: "trunk" }>;
export type BladeTuftGeometrySpec = Extract<PartGeometrySpec, { kind: "bladeTuft" }>;

/*
 * Foliage builders (MFW-70). Every result carries only `position` and `normal` plus an index (the same shader program key as
 * the other lit environment parts). Intermediate geometries are never uploaded to the GPU, so they are never disposed: the GC
 * frees them (as in createInstancedPartGeometry).
 */

const LUMP_PHASE_Y = 2;
const LUMP_PHASE_Z = 3;
const BLADE_SIDES = 3;
const HALF = 2;

/** Unit leaf clump: a welded icosahedron of radius 1, pushed radially by 1 + lumpAmplitude·h(p), with smooth normals. */
export function createLeafClumpGeometry(spec: LeafClumpGeometrySpec): BufferGeometry {
  const source = new IcosahedronGeometry(1, spec.detail);
  source.deleteAttribute("normal");
  source.deleteAttribute("uv");
  const merged = mergeVertices(source, LEAF_CLUMP_MERGE_TOLERANCE);
  const position = merged.getAttribute("position");
  const f = LEAF_CLUMP_LUMP_FREQUENCY;
  const s = spec.seed;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const h = Math.sin(f * x + s) * Math.sin(f * y + LUMP_PHASE_Y * s) * Math.sin(f * z + LUMP_PHASE_Z * s);
    const k = 1 + spec.lumpAmplitude * h;
    position.setXYZ(i, x * k, y * k, z * k);
  }
  position.needsUpdate = true;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** Tapered open trunk, base at y = 0, bent toward local +X by bend·(y/height)², with open-cone branch stubs. */
export function createTrunkGeometry(spec: TrunkGeometrySpec): BufferGeometry {
  const { height, bend } = spec;
  const spineX = (y: number) => bend * (y / height) ** 2;
  const main = new CylinderGeometry(spec.radiusTop, spec.radiusBottom, height, spec.radialSegments, spec.heightSegments, true);
  main.translate(0, height / HALF, 0);
  main.deleteAttribute("uv");
  const position = main.getAttribute("position");
  for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + spineX(position.getY(i)));
  const parts: BufferGeometry[] = [main];
  for (const b of spec.branches) {
    const cone = new CylinderGeometry(0, b.radius, b.length, b.radialSegments, 1, true);
    cone.deleteAttribute("uv");
    cone.translate(0, b.length / HALF, 0);
    cone.rotateZ(-b.tiltRad); // tilts +Y toward +X
    cone.rotateY(b.yawRad);
    cone.translate(spineX(b.atHeight), b.atHeight, 0);
    parts.push(cone);
  }
  const merged = parts.length === 1 ? main : mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}

/** Tuft of flattened three-sided open-cone blades, each leaned outward toward its angle; base at y = 0. */
export function createBladeTuftGeometry(spec: BladeTuftGeometrySpec): BufferGeometry {
  if (spec.blades.length === 0) throw new RangeError("bladeTuft needs at least one blade");
  const blades: BufferGeometry[] = [];
  for (const b of spec.blades) {
    const cone = new CylinderGeometry(0, b.width / HALF, b.height, BLADE_SIDES, 1, true);
    cone.deleteAttribute("uv");
    cone.translate(0, b.height / HALF, 0);
    cone.scale(1, 1, spec.thicknessRatio);
    cone.rotateZ(-b.leanRad);
    cone.rotateY(b.angleRad);
    cone.translate(b.distance * Math.cos(b.angleRad), 0, -b.distance * Math.sin(b.angleRad));
    blades.push(cone);
  }
  const merged = mergeGeometries(blades, false);
  merged.computeBoundingSphere();
  return merged;
}
