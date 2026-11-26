import {
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import { VILLAGER_HEIGHT, VILLAGER_MATERIAL, VILLAGER_MOTION, VILLAGER_PARTS } from "@/config/events/loyKrathong.life.config";
import type { ScenePartSpec } from "@/config/scene.config";
import { findNudgeEntry, writeNudgeAt, type NudgeFrame, type NudgeState, type ObjectPool } from "@/core/effects";
import {
  createVillagerPoseOut,
  RIVER_ITEM_EULER_ORDER,
  villagerPoseInto,
  type PreparedVillager,
  type RiverEnvironmentLayout,
  type VillagerInstancePlan,
  type VillagerPoseOut,
} from "@/core/world";
import type { DynamicBlobShadowsHandle } from "./BlobShadows";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { createInstancedPartGeometry, createInstancedPartMaterial } from "./geometry";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

/** Geometries of the three silhouette parts and the ONE shared silhouette material (owner, 2026-11-25). */
export interface VillagerAssets {
  readonly bodyGeometry: BufferGeometry;
  readonly headGeometry: BufferGeometry;
  readonly hatGeometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
}

const partGeometry = (part: ScenePartSpec) => createInstancedPartGeometry(part.geometry, part.material.flatShading);

export function createVillagerAssets(): VillagerAssets {
  return {
    bodyGeometry: partGeometry(VILLAGER_PARTS.body),
    headGeometry: partGeometry(VILLAGER_PARTS.head),
    hatGeometry: partGeometry(VILLAGER_PARTS.hat),
    material: createInstancedPartMaterial(VILLAGER_MATERIAL),
  };
}

export function disposeVillagerAssets(assets: VillagerAssets): void {
  assets.bodyGeometry.dispose();
  assets.headGeometry.dispose();
  assets.hatGeometry.dispose();
  assets.material.dispose();
}

export interface VillagerMeshes {
  readonly body: InstancedMesh;
  readonly head: InstancedMesh;
  readonly hat: InstancedMesh | null;
  readonly all: readonly InstancedMesh[];
}

/** Never culled (constant draw calls while villagers walk), no shadows, never takes taps (AC5), count = capacity. */
function villagerInstances(geometry: BufferGeometry, material: MeshStandardMaterial, capacity: number, name: string): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = capacity;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

export function createVillagerMeshes(assets: VillagerAssets, plan: VillagerInstancePlan): VillagerMeshes {
  const count = plan.villagerIds.length;
  const body = villagerInstances(assets.bodyGeometry, assets.material, count, SCENE_OBJECT_NAMES.villagerBodies);
  const head = villagerInstances(assets.headGeometry, assets.material, count, SCENE_OBJECT_NAMES.villagerHeads);
  const hats = plan.hatVillagerIds.length;
  const hat = hats > 0 ? villagerInstances(assets.hatGeometry, assets.material, hats, SCENE_OBJECT_NAMES.villagerHats) : null;
  return { body, head, hat, all: hat ? [body, head, hat] : [body, head] };
}

/** Disposes the meshes only (their instance buffers); geometry and material belong to the assets. */
export function disposeVillagerMeshes(meshes: VillagerMeshes): void {
  for (const mesh of meshes.all) mesh.dispose();
}

export interface VillagerWriteScratch {
  readonly pose: VillagerPoseOut;
  readonly base: Matrix4;
  readonly out: Matrix4;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly euler: Euler;
  readonly scale: Vector3;
  readonly body: Matrix4;
  readonly head: Matrix4;
  readonly hat: Matrix4;
}

const partLocal = (part: ScenePartSpec) =>
  new Matrix4().makeTranslation(0, part.yOffset, 0).multiply(new Matrix4().makeRotationY(part.yawOffsetRad));

export function createVillagerWriteScratch(): VillagerWriteScratch {
  return {
    pose: createVillagerPoseOut(),
    base: new Matrix4(),
    out: new Matrix4(),
    position: new Vector3(),
    quaternion: new Quaternion(),
    euler: new Euler(),
    scale: new Vector3(),
    body: partLocal(VILLAGER_PARTS.body),
    head: partLocal(VILLAGER_PARTS.head),
    hat: partLocal(VILLAGER_PARTS.hat),
  };
}

/** MFW-60 tap hop input (the shared nudge pool); `nowMs` / `reducedMotion` are refreshed by the caller. Render-time only. */
export interface VillagerNudgeInput {
  pool: ObjectPool<NudgeState>;
  nowMs: number;
  reducedMotion: boolean;
  frame: NudgeFrame;
}

/**
 * Allocation-free per-frame writer: every villager's pose (villagerPoseInto) → body, head and hat matrices (base =
 * T(pose + hop) · R(yaw, roll in YXZ: the waddle rolls about the walking direction) · S(scale)) and its blob shadow.
 * MFW-60: a tapped villager (nudge entry "villager", villagerId) also lifts by frame.liftY × scale (hop) or scales by frame.scale
 * (reduced motion); its blob shadow stays on the ground. Tap proxies go to the body centre (pose + VILLAGER_HEIGHT / 2 × scale, no hop).
 */
export function writeVillagerInstances(
  meshes: VillagerMeshes,
  plan: VillagerInstancePlan,
  villagers: readonly PreparedVillager[],
  layout: RiverEnvironmentLayout,
  timeMs: number,
  animated: boolean,
  scratch: VillagerWriteScratch,
  blobs: DynamicBlobShadowsHandle | null,
  nudge: VillagerNudgeInput | null = null,
  tapProxies: readonly (Object3D | null)[] | null = null,
): void {
  const pose = scratch.pose;
  for (let i = 0; i < villagers.length; i++) {
    const v = villagers[i];
    villagerPoseInto(v, layout.channel, layout.bankProfile, VILLAGER_MOTION, timeMs, animated, pose);
    let lift = 0;
    let size = 1;
    const e = nudge !== null ? findNudgeEntry(nudge.pool, "villager", v.def.villagerId) : null;
    if (nudge !== null && e !== null) {
      const f = writeNudgeAt("villager", nudge.nowMs - e.startedAtMs, nudge.reducedMotion, nudge.frame);
      lift = f.liftY * v.def.scale;
      size = f.scale;
    }
    scratch.position.set(pose.x, pose.y + pose.hopY + lift, pose.z);
    scratch.euler.set(0, pose.yawRad, pose.rollRad, RIVER_ITEM_EULER_ORDER);
    scratch.quaternion.setFromEuler(scratch.euler);
    scratch.scale.setScalar(v.def.scale * size);
    scratch.base.compose(scratch.position, scratch.quaternion, scratch.scale);
    meshes.body.setMatrixAt(i, scratch.out.multiplyMatrices(scratch.base, scratch.body));
    meshes.head.setMatrixAt(i, scratch.out.multiplyMatrices(scratch.base, scratch.head));
    const hatSlot = plan.hatSlotOf[i];
    if (meshes.hat && hatSlot >= 0) meshes.hat.setMatrixAt(hatSlot, scratch.out.multiplyMatrices(scratch.base, scratch.hat));
    blobs?.writeAt(i, pose.x, pose.z);
    const proxy = tapProxies !== null ? tapProxies[i] : null;
    if (proxy) proxy.position.set(pose.x, pose.y + (VILLAGER_HEIGHT / 2) * v.def.scale, pose.z);
  }
  for (let m = 0; m < meshes.all.length; m++) meshes.all[m].instanceMatrix.needsUpdate = true;
  blobs?.commit(villagers.length);
}
