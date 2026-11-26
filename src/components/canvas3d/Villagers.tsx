"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import { Object3D } from "three";
import {
  LOY_KRATHONG_VILLAGERS,
  VILLAGER_BLOB_SHADOW_RADIUS,
  VILLAGER_FOOTPRINT_RADIUS,
  VILLAGER_HEIGHT,
} from "@/config/events/loyKrathong.life.config";
import { createNudgeFrame, type NudgeSource } from "@/core/effects";
import { planVillagerInstances, prepareVillagers, type RiverEnvironmentLayout } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { DynamicBlobShadows, type DynamicBlobShadowsHandle } from "./BlobShadows";
import { propTapProxyRadius } from "./effects/propTapTargets";
import { propProxyTakesTap } from "./effects/riverHitPick";
import { createTapProxy } from "./effects/riverTapProxy";
import { isTapClick } from "./effects/tapPoint";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { useLivingWorldSettings } from "./useLivingWorldSettings";
import {
  createVillagerAssets,
  createVillagerMeshes,
  createVillagerWriteScratch,
  disposeVillagerAssets,
  disposeVillagerMeshes,
  writeVillagerInstances,
  type VillagerNudgeInput,
} from "./villagerMeshes";

export interface VillagersProps {
  readonly layout: RiverEnvironmentLayout;
  readonly now: () => number;
  /** MFW-60: the shared nudge pool (a tapped villager hops). */
  readonly nudges?: NudgeSource | null;
  /** MFW-60: when set (WORLD_EXPLORE only), one invisible tap proxy per villager reports its stable villagerId. */
  readonly onVillagerTapped?: (villagerId: number) => void;
}

/** Body sphere of a villager at scale 1 (the proxy and the water-edge rule use it). Derived from the silhouette parts. */
const VILLAGER_BODY_RADIUS = Math.max(VILLAGER_HEIGHT / 2, VILLAGER_FOOTPRINT_RADIUS);

/**
 * MFW-50 (backlog story 9-4, AC1, AC2, AC4, AC5): silhouette villagers strolling along the riverside paths. Count per tier from
 * LIVING_WORLD_TIERS; 3 instanced meshes (body, head, hat) share one geometry set and one material, plus one blob-shadow mesh.
 * Poses come from config + the clock every frame (no state); reduced motion and LOW = the static STAND pose, written once.
 * The villager meshes never raycast. MFW-60: taps go through invisible proxies that follow the villagers (only with
 * onVillagerTapped); a tapped villager hops (reduced motion: a steady size-up), written while it runs plus one tail frame.
 */
export function Villagers({ layout, now, nudges = null, onVillagerTapped }: VillagersProps): JSX.Element | null {
  const s = useLivingWorldSettings();
  const reducedMotion = useDeviceStore((state) => state.reducedMotion);
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
  const tappable = onVillagerTapped !== undefined;
  const proxy = useMemo(() => (tappable ? createTapProxy(1) : null), [tappable]);
  useEffect(() => () => proxy?.dispose(), [proxy]);
  const proxies = useRef<(Object3D | null)[]>([]);
  /** The hop input, re-made only when the pool changes; nowMs / reducedMotion are refreshed before every write. */
  const nudgeRef = useRef<VillagerNudgeInput | null>(null);
  const wasNudging = useRef(false);
  useLayoutEffect(() => {
    nudgeRef.current = nudges ? { pool: nudges.pool, nowMs: 0, reducedMotion: false, frame: createNudgeFrame() } : null;
  }, [nudges]);

  useLayoutEffect(() => {
    if (prepared.length === 0) return;
    const nudge = nudgeRef.current;
    if (nudge !== null && nudges) {
      nudge.nowMs = nudges.now();
      nudge.reducedMotion = reducedMotion;
    }
    writeVillagerInstances(meshes, plan, prepared, layout, now(), walk, scratch, blobs.current, nudge, proxies.current);
    invalidate();
  }, [meshes, plan, prepared, layout, walk, now, scratch, invalidate, nudges, reducedMotion, proxy]);

  useFrame(() => {
    if (prepared.length === 0) return;
    const nudge = nudgeRef.current;
    const nudging = nudge !== null && nudge.pool.activeCount > 0;
    if (!walk && !nudging && !wasNudging.current) return;
    if (nudge !== null && nudges) {
      nudge.nowMs = nudges.now();
      nudge.reducedMotion = reducedMotion;
    }
    writeVillagerInstances(meshes, plan, prepared, layout, now(), walk, scratch, blobs.current, nudge, proxies.current);
    wasNudging.current = nudging;
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
      {proxy !== null &&
        onVillagerTapped !== undefined &&
        prepared.map((v, i) => {
          const bodyRadius = VILLAGER_BODY_RADIUS * v.def.scale;
          return (
            <mesh
              key={v.def.villagerId}
              ref={(m: unknown) => {
                proxies.current[i] = m instanceof Object3D ? m : null; // the DOM test stub renders plain elements
              }}
              name={`${SCENE_OBJECT_NAMES.propTapPrefix}villager-${v.def.villagerId}`}
              geometry={proxy.geometry}
              material={proxy.material}
              visible={false}
              scale={propTapProxyRadius(bodyRadius)}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (!isTapClick(event) || !propProxyTakesTap(event, bodyRadius)) return;
                event.stopPropagation();
                onVillagerTapped(v.def.villagerId);
              }}
            />
          );
        })}
    </group>
  );
}
