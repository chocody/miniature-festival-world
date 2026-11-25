"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import { LOY_KRATHONG_VILLAGERS, VILLAGER_BLOB_SHADOW_RADIUS } from "@/config/events/loyKrathong.life.config";
import { planVillagerInstances, prepareVillagers, type RiverEnvironmentLayout } from "@/core/world";
import { DynamicBlobShadows, type DynamicBlobShadowsHandle } from "./BlobShadows";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { useLivingWorldSettings } from "./useLivingWorldSettings";
import {
  createVillagerAssets,
  createVillagerMeshes,
  createVillagerWriteScratch,
  disposeVillagerAssets,
  disposeVillagerMeshes,
  writeVillagerInstances,
} from "./villagerMeshes";

export interface VillagersProps {
  readonly layout: RiverEnvironmentLayout;
  readonly now: () => number;
}

/**
 * MFW-50 (backlog story 9-4, AC1, AC2, AC4, AC5): silhouette villagers strolling along the riverside paths. Count per tier from
 * LIVING_WORLD_TIERS; 3 instanced meshes (body, head, hat) share one geometry set and one material, plus one blob-shadow mesh.
 * Poses come from config + the clock every frame (no state); reduced motion and LOW = the static STAND pose, written once.
 * Never raycast, no handlers: villagers never take taps.
 */
export function Villagers({ layout, now }: VillagersProps): JSX.Element | null {
  const s = useLivingWorldSettings();
  const invalidate = useThree((state) => state.invalidate);
  const prepared = useMemo(
    () => prepareVillagers(LOY_KRATHONG_VILLAGERS.slice(0, s.villagerCount), layout.paths, layout.channel),
    [s.villagerCount, layout],
  );
  const plan = useMemo(() => planVillagerInstances(prepared.map((v) => v.def)), [prepared]);
  const assets = useMemo(() => createVillagerAssets(), []);
  useEffect(() => () => disposeVillagerAssets(assets), [assets]);
  const meshes = useMemo(() => createVillagerMeshes(assets, plan), [assets, plan]);
  useEffect(() => () => disposeVillagerMeshes(meshes), [meshes]);
  const [scratch] = useState(createVillagerWriteScratch);
  const blobs = useRef<DynamicBlobShadowsHandle | null>(null);
  const walk = s.villagersWalk;

  useLayoutEffect(() => {
    if (prepared.length === 0) return;
    writeVillagerInstances(meshes, plan, prepared, layout, now(), walk, scratch, blobs.current);
    invalidate();
  }, [meshes, plan, prepared, layout, walk, now, scratch, invalidate]);

  useFrame(() => {
    if (!walk || prepared.length === 0) return;
    writeVillagerInstances(meshes, plan, prepared, layout, now(), true, scratch, blobs.current);
  });

  if (prepared.length === 0) return null;
  return (
    <group name={SCENE_OBJECT_NAMES.villagers}>
      {meshes.all.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      <DynamicBlobShadows
        ref={blobs}
        name={SCENE_OBJECT_NAMES.villagerBlobShadows}
        capacity={prepared.length}
        surfaceY={layout.bankTopY}
        radius={VILLAGER_BLOB_SHADOW_RADIUS}
      />
    </group>
  );
}
