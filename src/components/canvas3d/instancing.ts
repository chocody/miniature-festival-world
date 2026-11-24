import { Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";

const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchEuler = new Euler();
const scratchQuaternion = new Quaternion();
const scratchMatrix = new Matrix4();

/** Allocation-free: writes T(position + (0, yOffset·scale, 0)) · R_y(yaw + yawOffset) · S(scale) into `out`. */
export function composeInstanceMatrix(
  t: InstanceTransform,
  part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
  out: Matrix4,
): Matrix4 {
  scratchPosition.set(t.position.x, t.position.y + part.yOffset * t.scale, t.position.z);
  scratchQuaternion.setFromEuler(scratchEuler.set(0, t.yawRad + part.yawOffsetRad, 0));
  scratchScale.setScalar(t.scale);
  return out.compose(scratchPosition, scratchQuaternion, scratchScale);
}

/** Writes all instance matrices, flags the upload and refreshes the bounding sphere (raycast + frustum culling). */
export function applyInstanceTransforms(
  mesh: Pick<InstancedMesh, "setMatrixAt" | "instanceMatrix" | "computeBoundingSphere">,
  transforms: readonly InstanceTransform[],
  part: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">,
): void {
  transforms.forEach((t, i) => mesh.setMatrixAt(i, composeInstanceMatrix(t, part, scratchMatrix)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Tier gate: nothing casts or receives shadows unless the tier budget has shadows. */
export function partShadowProps(part: Pick<ScenePartSpec, "castShadow" | "receiveShadow">, tierShadows: boolean) {
  return { castShadow: tierShadows && part.castShadow, receiveShadow: tierShadows && part.receiveShadow };
}
