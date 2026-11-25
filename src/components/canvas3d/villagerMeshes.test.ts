// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BufferGeometry,
  Euler,
  FrontSide,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { LOY_KRATHONG_VILLAGERS, VILLAGER_MOTION, VILLAGER_PARTS } from "@/config/events/loyKrathong.life.config";
import { VILLAGER_LOOK } from "@/config/look.config";
import { LIVING_WORLD_TIERS, type RenderTier } from "@/config/performance.config";
import {
  createVillagerPoseOut,
  planVillagerInstances,
  prepareVillagers,
  RIVER_ITEM_EULER_ORDER,
  villagerPoseInto,
} from "@/core/world";
import type { DynamicBlobShadowsHandle } from "./BlobShadows";
import { NO_RAYCAST } from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import {
  createVillagerAssets,
  createVillagerMeshes,
  createVillagerWriteScratch,
  disposeVillagerAssets,
  disposeVillagerMeshes,
  writeVillagerInstances,
} from "./villagerMeshes";

const prepared = (tier: RenderTier) =>
  prepareVillagers(LOY_KRATHONG_VILLAGERS.slice(0, LIVING_WORLD_TIERS[tier].villagerCount), layout.paths, layout.channel);
const planOf = (tier: RenderTier) => planVillagerInstances(prepared(tier).map((v) => v.def));

afterEach(() => vi.restoreAllMocks());

describe("villager meshes (MFW-50 AC2, AC5)", () => {
  it("VM1 one shared silhouette material and one geometry per part", () => {
    const assets = createVillagerAssets();
    const meshes = createVillagerMeshes(assets, planOf("HIGH"));
    expect(assets.material.color.getHexString()).toBe(VILLAGER_LOOK.silhouette.slice(1).toLowerCase());
    for (const mesh of meshes.all) expect(mesh.material).toBe(assets.material);
    expect(meshes.body.geometry).toBe(assets.bodyGeometry);
    expect(meshes.head.geometry).toBe(assets.headGeometry);
    expect(meshes.hat!.geometry).toBe(assets.hatGeometry);
    disposeVillagerMeshes(meshes);
    disposeVillagerAssets(assets);
  });

  it("VM2 program parity with the environment parts: smooth, opaque, no vertex colours", () => {
    const assets = createVillagerAssets();
    const m = assets.material;
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect(m.flatShading).toBe(false);
    expect(m.vertexColors).toBe(false);
    expect(m.transparent).toBe(false);
    expect(m.toneMapped).toBe(true);
    expect(m.side).toBe(FrontSide);
    for (const g of [assets.bodyGeometry, assets.headGeometry, assets.hatGeometry]) expect(g.getAttribute("color")).toBeUndefined();
    expect(assets.hatGeometry.index).toBeNull(); // faceted hat: flatness baked into the normals
    disposeVillagerAssets(assets);
  });

  it("VM3 names, capacities and counts per tier; never culled, no shadows", () => {
    const assets = createVillagerAssets();
    const expected = { HIGH: [8, 3], MEDIUM: [5, 2], LOW: [2, 1] } as const;
    for (const tier of ["HIGH", "MEDIUM", "LOW"] as const) {
      const meshes = createVillagerMeshes(assets, planOf(tier));
      const [villagers, hats] = expected[tier];
      expect(meshes.body.name).toBe(SCENE_OBJECT_NAMES.villagerBodies);
      expect(meshes.head.name).toBe(SCENE_OBJECT_NAMES.villagerHeads);
      expect(meshes.hat!.name).toBe(SCENE_OBJECT_NAMES.villagerHats);
      expect([meshes.body.count, meshes.head.count, meshes.hat!.count]).toEqual([villagers, villagers, hats]);
      expect(meshes.body.instanceMatrix.count).toBe(villagers);
      expect(meshes.hat!.instanceMatrix.count).toBe(hats);
      expect(meshes.all).toHaveLength(3);
      for (const mesh of meshes.all) {
        expect(mesh.frustumCulled).toBe(false);
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(false);
      }
      disposeVillagerMeshes(meshes);
    }
    const noHats = createVillagerMeshes(assets, planVillagerInstances([{ ...LOY_KRATHONG_VILLAGERS[0], hat: false }]));
    expect(noHats.hat).toBeNull();
    expect(noHats.all).toHaveLength(2);
    disposeVillagerAssets(assets);
  });

  it("VM4 villagers never take taps: NO_RAYCAST, and a real raycaster misses a written head", () => {
    const assets = createVillagerAssets();
    const v = prepared("HIGH");
    const plan = planOf("HIGH");
    const meshes = createVillagerMeshes(assets, plan);
    writeVillagerInstances(meshes, plan, v, layout, 0, false, createVillagerWriteScratch(), null);
    for (const mesh of meshes.all) expect(mesh.raycast).toBe(NO_RAYCAST);
    const head = new Matrix4();
    meshes.head.getMatrixAt(0, head);
    const at = new Vector3().setFromMatrixPosition(head);
    const ray = new Raycaster(new Vector3(at.x, at.y + 5, at.z), new Vector3(0, -1, 0));
    expect(ray.intersectObject(meshes.head)).toEqual([]);
    expect(ray.intersectObject(meshes.body)).toEqual([]);
    disposeVillagerMeshes(meshes);
    disposeVillagerAssets(assets);
  });

  it("VM5 the writer: head = pose + R(yaw, roll)·(0, yOffset·scale, 0) + hop; blobs and upload flags", () => {
    const assets = createVillagerAssets();
    const v = prepared("HIGH");
    const plan = planOf("HIGH");
    const meshes = createVillagerMeshes(assets, plan);
    const blobs: DynamicBlobShadowsHandle = { writeAt: vi.fn(), hideAt: vi.fn(), commit: vi.fn() };
    const versions = meshes.all.map((m) => m.instanceMatrix.version);
    const t = 12_345;
    writeVillagerInstances(meshes, plan, v, layout, t, true, createVillagerWriteScratch(), blobs);
    meshes.all.forEach((m, i) => expect(m.instanceMatrix.version).toBeGreaterThan(versions[i]));
    v.forEach((villager, i) => {
      const pose = villagerPoseInto(villager, layout.channel, layout.bankProfile, VILLAGER_MOTION, t, true, createVillagerPoseOut());
      const q = new Quaternion().setFromEuler(new Euler(0, pose.yawRad, pose.rollRad, RIVER_ITEM_EULER_ORDER));
      const offset = new Vector3(0, VILLAGER_PARTS.head.yOffset * villager.def.scale, 0).applyQuaternion(q);
      const expected = new Vector3(pose.x, pose.y + pose.hopY, pose.z).add(offset);
      const m = new Matrix4();
      meshes.head.getMatrixAt(i, m);
      const got = new Vector3().setFromMatrixPosition(m);
      expect(got.distanceTo(expected), String(i)).toBeLessThan(1e-6);
      expect(blobs.writeAt).toHaveBeenCalledWith(i, pose.x, pose.z);
    });
    expect(blobs.commit).toHaveBeenCalledWith(v.length);
    disposeVillagerMeshes(meshes);
    disposeVillagerAssets(assets);
  });

  it("VM6 disposal: 3 geometries + 1 material once each; meshes dispose only themselves", () => {
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const meshDispose = vi.spyOn(InstancedMesh.prototype, "dispose");
    const assets = createVillagerAssets();
    const meshes = createVillagerMeshes(assets, planOf("HIGH"));
    disposeVillagerMeshes(meshes);
    expect(meshDispose).toHaveBeenCalledTimes(3);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    disposeVillagerAssets(assets);
    expect(geometryDispose).toHaveBeenCalledTimes(3);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
