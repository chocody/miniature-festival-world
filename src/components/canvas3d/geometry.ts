import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MatteMaterialSpec, PartGeometrySpec } from "@/config/scene.config";
import type { BankGeometryData, RibbonGeometryData } from "@/core/world";
import { createBladeTuftGeometry, createLeafClumpGeometry, createTrunkGeometry } from "./foliageGeometry";

/** three's MeshStandardMaterial default. */
const DEFAULT_EMISSIVE_INTENSITY = 1;
/** Default icosahedron detail: 0 = 20 flat faces (a part spec may ask for more, e.g. detail 1 = 80 for round canopies). */
const ICOSAHEDRON_DETAIL = 0;
const NORMAL_UP = [0, 1, 0] as const;
const VECTOR3_ITEM_SIZE = 3;
const INDEX_ITEM_SIZE = 1;
const TRIANGLE_VERTICES = 3;

export function createPartGeometry(spec: PartGeometrySpec): BufferGeometry {
  switch (spec.kind) {
    case "box":
      return new BoxGeometry(spec.width, spec.height, spec.depth);
    case "cone":
      return new ConeGeometry(spec.radius, spec.height, spec.radialSegments);
    case "cylinder":
      return new CylinderGeometry(spec.radiusTop, spec.radiusBottom, spec.height, spec.radialSegments);
    case "icosahedron": {
      const geometry = new IcosahedronGeometry(spec.radius, spec.detail ?? ICOSAHEDRON_DETAIL);
      if (spec.scaleY !== undefined && spec.scaleY !== 1) geometry.scale(1, spec.scaleY, 1); // puffy squash (MFW-49)
      return geometry;
    }
    case "gable":
      return createGableGeometry(spec.width, spec.depth, spec.height);
    case "roundedBox":
      return new RoundedBoxGeometry(spec.width, spec.height, spec.depth, spec.segments, spec.radius);
    case "leafClump":
      return createLeafClumpGeometry(spec);
    case "trunk":
      return createTrunkGeometry(spec);
    case "bladeTuft":
      return createBladeTuftGeometry(spec);
    default: {
      const never: never = spec;
      throw new RangeError(`unknown part geometry ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Gable roof (MFW-49): a triangular prism with its ridge along local x, base at y = −height/2 and ridge at +height/2.
 * Non-indexed, 8 triangles (2 per slope, 1 per gable end, 2 for the base), one normal per face.
 */
function createGableGeometry(width: number, depth: number, height: number): BufferGeometry {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  // prettier-ignore
  const positions = new Float32Array([
    -x, -y, z, x, -y, z, x, y, 0, // front slope (+z)
    -x, -y, z, x, y, 0, -x, y, 0,
    x, -y, -z, -x, -y, -z, -x, y, 0, // back slope (−z)
    x, -y, -z, -x, y, 0, x, y, 0,
    x, -y, z, x, -y, -z, x, y, 0, // gable end (+x)
    -x, -y, -z, -x, -y, z, -x, y, 0, // gable end (−x)
    -x, -y, -z, x, -y, -z, x, -y, z, // base (−y)
    -x, -y, -z, x, -y, z, -x, -y, z,
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, VECTOR3_ITEM_SIZE));
  geometry.computeVertexNormals(); // non-indexed: each triangle gets its own face normal
  geometry.computeBoundingSphere();
  return geometry;
}

/** Kinds whose three geometry already has one normal per face (no shared vertices across faces). */
const FACETED_KINDS: ReadonlySet<PartGeometrySpec["kind"]> = new Set(["box", "gable"]);

/**
 * Instanced part geometry and material that share ONE compiled shader program for every instanced part (MFW-47 perf):
 * a flat-shaded spec gets its flatness baked into per-face normals (non-indexed copy) and a smooth-shaded material,
 * so flat roofs and smooth trunks/canopies no longer compile two program variants (SwiftShader compile stalls).
 * The look is unchanged: per-face normals shade exactly like `flatShading`.
 */
export function createInstancedPartGeometry(spec: PartGeometrySpec, flat: boolean): BufferGeometry {
  const geometry = createPartGeometry(spec);
  if (!flat || FACETED_KINDS.has(spec.kind)) return geometry;
  // The indexed source was never uploaded to the GPU, so it needs no dispose; the GC frees it.
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals(); // non-indexed: each triangle gets its own face normal
  return faceted;
}

export function createInstancedPartMaterial(spec: MatteMaterialSpec): MeshStandardMaterial {
  return createMatteMaterial({ ...spec, flatShading: false });
}

/** Runtime emissive change (a uniform: no shader recompile), e.g. the village lights per light preset (MFW-49). */
export function applyEmissiveIntensity(material: MeshStandardMaterial, emissiveIntensity: number): void {
  material.emissiveIntensity = emissiveIntensity;
}

export function createMatteMaterial(spec: MatteMaterialSpec): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    flatShading: spec.flatShading,
    ...(spec.emissive
      ? { emissive: spec.emissive, emissiveIntensity: spec.emissiveIntensity ?? DEFAULT_EMISSIVE_INTENSITY }
      : {}),
  });
}

export function createRibbonGeometry(data: RibbonGeometryData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(data.positions, VECTOR3_ITEM_SIZE));
  const normals = new Float32Array(data.vertexCount * VECTOR3_ITEM_SIZE);
  for (let i = 0; i < data.vertexCount; i++) normals.set(NORMAL_UP, i * VECTOR3_ITEM_SIZE);
  g.setAttribute("normal", new BufferAttribute(normals, VECTOR3_ITEM_SIZE));
  g.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  g.computeBoundingSphere();
  return g;
}

/** Rounded bank surface (MFW-49): indexed, smooth vertex normals (the rounded lip), absolute world heights. */
export function createBankGeometry(data: BankGeometryData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(data.positions, VECTOR3_ITEM_SIZE));
  g.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function countTriangles(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / TRIANGLE_VERTICES;
}
