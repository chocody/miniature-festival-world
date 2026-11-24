import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
} from "three";
import type { MatteMaterialSpec, PartGeometrySpec } from "@/config/scene.config";
import type { RibbonGeometryData } from "@/core/world";

/** three's MeshStandardMaterial default. */
const DEFAULT_EMISSIVE_INTENSITY = 1;
/** Icosahedron detail 0 = 20 flat faces. */
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
    case "icosahedron":
      return new IcosahedronGeometry(spec.radius, ICOSAHEDRON_DETAIL);
    default: {
      const never: never = spec;
      throw new RangeError(`unknown part geometry ${JSON.stringify(never)}`);
    }
  }
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

export function countTriangles(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / TRIANGLE_VERTICES;
}
