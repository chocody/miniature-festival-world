import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MatteMaterialSpec, PartGeometrySpec, StaticPartMesh } from "@/config/scene.config";
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
/** RGBA bytes per vertex of a vertex-coloured static mesh (the MFW-65 design-body layout: one program variant). */
const COLOR_ITEM_SIZE = 4;
const BYTE_MAX = 255;

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
    case "staticMesh":
      return createStaticMeshGeometry(spec.mesh);
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

/**
 * Static mesh (MFW-66, the owner house model): non-indexed, flat normals (one per face), and when `faceColors` is set a
 * per-face "color" attribute = Uint8 RGBA normalized (sRGB hex → three's linear working colour, alpha 255), the same layout as
 * the MFW-65 krathong design body so both share one program variant.
 */
export function createStaticMeshGeometry(mesh: StaticPartMesh): BufferGeometry {
  const { positions, indices, faceColors, palette } = mesh;
  if (indices.length % TRIANGLE_VERTICES !== 0) throw new RangeError(`static mesh: ${indices.length} indices is not a multiple of 3`);
  const vertexCount = positions.length / VECTOR3_ITEM_SIZE;
  const triangles = indices.length / TRIANGLE_VERTICES;
  if (faceColors !== null && faceColors.length !== triangles)
    throw new RangeError(`static mesh: ${faceColors.length} face colours for ${triangles} triangles`);
  const out = new Float32Array(indices.length * VECTOR3_ITEM_SIZE);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (!Number.isInteger(v) || v < 0 || v >= vertexCount) throw new RangeError(`static mesh: index ${v} out of range`);
    out[i * 3] = positions[v * 3];
    out[i * 3 + 1] = positions[v * 3 + 1];
    out[i * 3 + 2] = positions[v * 3 + 2];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(out, VECTOR3_ITEM_SIZE));
  geometry.computeVertexNormals(); // non-indexed: each triangle gets its own face normal
  if (faceColors !== null) {
    const bytes = palette.map((hex) => {
      const c = new Color(hex); // sRGB hex → linear working colour
      return [Math.round(c.r * BYTE_MAX), Math.round(c.g * BYTE_MAX), Math.round(c.b * BYTE_MAX), BYTE_MAX];
    });
    const colors = new Uint8Array(indices.length * COLOR_ITEM_SIZE);
    for (let f = 0; f < triangles; f++) {
      const rgba = bytes[faceColors[f]];
      if (!Number.isInteger(faceColors[f]) || rgba === undefined)
        throw new RangeError(`static mesh: palette index ${faceColors[f]} out of range`);
      for (let k = 0; k < TRIANGLE_VERTICES; k++) colors.set(rgba, (f * TRIANGLE_VERTICES + k) * COLOR_ITEM_SIZE);
    }
    geometry.setAttribute("color", new BufferAttribute(colors, COLOR_ITEM_SIZE, true));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Kinds whose three geometry already has one normal per face (no shared vertices across faces). */
const FACETED_KINDS: ReadonlySet<PartGeometrySpec["kind"]> = new Set(["box", "gable", "staticMesh"]);

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
    vertexColors: spec.vertexColors ?? false,
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
