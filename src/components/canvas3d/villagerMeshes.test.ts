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
  Object3D,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { LOY_KRATHONG_RIVER_LAYOUT as layout } from "@/components/models/loyKrathong/riverLayout";
import { LOY_KRATHONG_VILLAGERS, VILLAGER_HEIGHT, VILLAGER_MOTION, VILLAGER_PARTS } from "@/config/events/loyKrathong.life.config";
import { REDUCED_MOTION_TAP_CUE, VILLAGER_TAP_HOP } from "@/config/gimmicks.config";
import { EFFECT_POOL_CAPS } from "@/config/performance.config";
import { createNudgeFrame, createObjectPoolManager, startNudge } from "@/core/effects";
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
const createObjectPoolManagerForTest = () => createObjectPoolManager(EFFECT_POOL_CAPS.HIGH).nudge;

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

describe("villager tap hop (MFW-60)", () => {
  const setup = (reducedMotion: boolean, nowMs: number) => {
    const v = prepared("HIGH");
    const plan = planVillagerInstances(v.map((x) => x.def));
    const meshes = createVillagerMeshes(createVillagerAssets(), plan);
    const pool = createObjectPoolManagerForTest();
    const nudge = { pool, nowMs, reducedMotion, frame: createNudgeFrame() };
    return { v, plan, meshes, pool, nudge };
  };
  const bodyAt = (mesh: InstancedMesh, i: number) => {
    const m = new Matrix4();
    mesh.getMatrixAt(i, m);
    const p = new Vector3();
    const s = new Vector3();
    m.decompose(p, new Quaternion(), s);
    return { p, s };
  };
  const blobLog = () => {
    const writes: [number, number, number][] = [];
    const handle: DynamicBlobShadowsHandle = { writeAt: (i, x, z) => writes.push([i, x, z]), hideAt: () => {}, commit: () => {} };
    return { writes, handle };
  };

  it("VM-a: a hop lifts only the tapped villager; its blob shadow stays on the ground", () => {
    const D = VILLAGER_TAP_HOP.durationMs;
    const { v, plan, meshes, pool, nudge } = setup(false, 1_000 + D / 2);
    const still = createVillagerMeshes(createVillagerAssets(), plan);
    const a = blobLog();
    const b = blobLog();
    writeVillagerInstances(still, plan, v, layout, 0, false, createVillagerWriteScratch(), a.handle);
    startNudge(pool, "villager", v[1].def.villagerId, 1_000);
    writeVillagerInstances(meshes, plan, v, layout, 0, false, createVillagerWriteScratch(), b.handle, nudge);
    expect(bodyAt(meshes.body, 1).p.y - bodyAt(still.body, 1).p.y).toBeCloseTo(VILLAGER_TAP_HOP.heightScale * v[1].def.scale, 5);
    expect(bodyAt(meshes.body, 0).p.y).toBeCloseTo(bodyAt(still.body, 0).p.y, 6);
    expect(b.writes).toEqual(a.writes);
  });

  it("VM-b: tap proxies sit at the body centre (no hop offset)", () => {
    const { v, plan, meshes, pool, nudge } = setup(false, 1_100);
    startNudge(pool, "villager", v[0].def.villagerId, 1_000);
    const proxies = v.map(() => new Object3D());
    writeVillagerInstances(meshes, plan, v, layout, 0, false, createVillagerWriteScratch(), null, nudge, proxies);
    const pose = createVillagerPoseOut();
    v.forEach((villager, i) => {
      villagerPoseInto(villager, layout.channel, layout.bankProfile, VILLAGER_MOTION, 0, false, pose);
      expect(proxies[i].position.x).toBeCloseTo(pose.x, 9);
      expect(proxies[i].position.y).toBeCloseTo(pose.y + (VILLAGER_HEIGHT / 2) * villager.def.scale, 9);
      expect(proxies[i].position.z).toBeCloseTo(pose.z, 9);
    });
  });

  it("VM-c: reduced motion scales the tapped villager (no lift)", () => {
    const { v, plan, meshes, pool, nudge } = setup(true, 1_100);
    const still = createVillagerMeshes(createVillagerAssets(), plan);
    writeVillagerInstances(still, plan, v, layout, 0, false, createVillagerWriteScratch(), null);
    startNudge(pool, "villager", v[0].def.villagerId, 1_000);
    writeVillagerInstances(meshes, plan, v, layout, 0, false, createVillagerWriteScratch(), null, nudge);
    expect(bodyAt(meshes.body, 0).s.x).toBeCloseTo(bodyAt(still.body, 0).s.x * REDUCED_MOTION_TAP_CUE.scale.villager, 5);
    // scaled about the feet (the pose point): the body part's own offset grows with the cue, nothing is lifted
    const cue = REDUCED_MOTION_TAP_CUE.scale.villager;
    const dy = bodyAt(meshes.body, 0).p.y - bodyAt(still.body, 0).p.y;
    expect(dy).toBeCloseTo(VILLAGER_PARTS.body.yOffset * v[0].def.scale * (cue - 1), 5);
    expect(bodyAt(meshes.body, 0).p.x).toBeCloseTo(bodyAt(still.body, 0).p.x, 6);
  });
});
