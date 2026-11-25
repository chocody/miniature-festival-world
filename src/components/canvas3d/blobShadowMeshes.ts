import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { BLOB_SHADOW_LOOK } from "@/config/look.config";
import {
  buildBlobShadowFan,
  type BlobShadowFanSpec,
  type InstanceTransform,
  type VertexAlphaMeshData,
} from "@/core/world";

const XYZ = 3;
const RGBA = 4;
const INDEX_ITEM_SIZE = 1;

/** Blobs never take taps (they would steal water / prop hits; coordination with MFW-59). */
export const NO_RAYCAST: Object3D["raycast"] = () => {};

/** Vertex-alpha mesh: position(3), color(4, vertex alpha) and index. Shared by blobs and the MFW-49 water / light fans. */
export function createVertexAlphaGeometry(data: VertexAlphaMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, XYZ));
  geometry.setAttribute("color", new BufferAttribute(data.colors, RGBA));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Unit-disc fan in the xz plane: position(3), color(4, vertex alpha) and index from buildBlobShadowFan. */
export function createBlobShadowGeometry(spec: BlobShadowFanSpec): BufferGeometry {
  return createVertexAlphaGeometry(buildBlobShadowFan(spec));
}

/** Colour, opacity and blending of a vertex-alpha fan material. */
export interface FanMaterialLook {
  readonly color: string;
  readonly opacity: number;
  readonly additive: boolean;
}

/**
 * Unlit, transparent vertex-alpha material; no depth write so fans never cut each other. Every fan (blobs, water highlights,
 * lamp light pools) uses these parameters, so they all share the blob shader program (MFW-49: no new shader variant).
 */
export function createFanMaterial(look: FanMaterialLook): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: look.color,
    opacity: look.opacity,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: BLOB_SHADOW_LOOK.polygonOffsetFactor,
    polygonOffsetUnits: BLOB_SHADOW_LOOK.polygonOffsetUnits,
    ...(look.additive ? { blending: AdditiveBlending } : {}),
  });
}

/** Unlit, transparent, sage-tinted (never black) blob material; no depth write so blobs never cut each other. */
export function createBlobShadowMaterial(): MeshBasicMaterial {
  return createFanMaterial({ color: BLOB_SHADOW_LOOK.color, opacity: BLOB_SHADOW_LOOK.opacity, additive: false });
}

/** One draw call for up to `capacity` blobs; starts empty (count 0), never culled, casts/receives nothing, ignores taps. */
export function createBlobShadowInstances(
  geometry: BufferGeometry,
  material: Material,
  capacity: number,
  name: string,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

export interface BlobShadowRadii {
  readonly radiusX: number;
  readonly radiusZ: number;
}

const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchEuler = new Euler();
const scratchQuaternion = new Quaternion();
const scratchMatrix = new Matrix4();

/** Static blobs: matrix = T(p.x, p.y + liftY, p.z) · R_y(yaw) · S(radiusX·scale, 1, radiusZ·scale). */
export function writeStaticBlobShadows(
  mesh: InstancedMesh,
  groups: readonly { readonly transforms: readonly InstanceTransform[]; readonly radii: BlobShadowRadii }[],
  liftY: number,
): void {
  let index = 0;
  for (const { transforms, radii } of groups) {
    for (const t of transforms) {
      scratchPosition.set(t.position.x, t.position.y + liftY, t.position.z);
      scratchQuaternion.setFromEuler(scratchEuler.set(0, t.yawRad, 0));
      scratchScale.set(radii.radiusX * t.scale, 1, radii.radiusZ * t.scale);
      mesh.setMatrixAt(index, scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale));
      index += 1;
    }
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
}

/** Per-frame writer (allocation-free): a round blob of `radius` at (x, y, z). */
export function writeBlobShadowAt(
  mesh: InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  radius: number,
  scratch: Matrix4,
): void {
  scratch.makeScale(radius, 1, radius).setPosition(x, y, z);
  mesh.setMatrixAt(index, scratch);
}

/** Per-frame commit (allocation-free): shows the first `count` blobs and flags the upload when there are any. */
export function commitBlobShadows(mesh: InstancedMesh, count: number): void {
  mesh.count = count;
  if (count > 0) mesh.instanceMatrix.needsUpdate = true;
}
