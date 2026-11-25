"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import type { EffectKind, EffectPoolCaps } from "@/config/performance.config";
import type { ScenePartSpec } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates";
import { createObjectPoolManager } from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import {
  createEffectFrameScratch,
  createLampGlowMesh,
  createRippleMesh,
  disposeEffectMesh,
  writeLampGlowInstances,
  writeRippleInstances,
} from "./effectMeshes";

/** Kinds recorded on the scene section's data-last-gimmick attribute (tests/e2e). */
export type SceneGimmickKind = "ripple" | "lamp-glow" | "inspect";

export interface SceneEffectsHandle {
  /** Starts a ripple at a world-view-group-local point (non-finite → ignored). Recycles the oldest when the pool is full. */
  spawnRipple(at: WorldXZ): void;
  /** Lights lamp `lampIndex` (restarts it if already lit; a non-integer or out-of-range index → ignored). */
  lightLamp(lampIndex: number): void;
  activeCount(kind: EffectKind): number;
}

export interface SceneEffectsProps {
  readonly handleRef: Ref<SceneEffectsHandle>;
  readonly caps: EffectPoolCaps; // EFFECT_POOL_CAPS[tier] (stable frozen object per tier)
  readonly reducedMotion: boolean;
  readonly waterSurfaceY: number;
  readonly lamps: readonly InstanceTransform[];
  readonly lampHead: ScenePartSpec;
  /** Clock in ms; default Date.now. Injectable for tests. */
  readonly now?: () => number;
}

/** Pooled tap effects (invariant E): one InstancedMesh per kind, created per cap, disposed on unmount/cap change. */
export function SceneEffects({
  handleRef,
  caps,
  reducedMotion,
  waterSurfaceY,
  lamps,
  lampHead,
  now = Date.now,
}: SceneEffectsProps) {
  const invalidate = useThree((state) => state.invalidate);
  const pools = useMemo(() => createObjectPoolManager(caps), [caps]);
  const ripple = useMemo(() => createRippleMesh(caps.ripple), [caps.ripple]);
  const glow = useMemo(() => createLampGlowMesh(caps.glow, lampHead.geometry), [caps.glow, lampHead.geometry]);
  const scratch = useRef(createEffectFrameScratch());
  useEffect(() => () => disposeEffectMesh(ripple), [ripple]);
  useEffect(() => () => disposeEffectMesh(glow), [glow]);
  useEffect(() => () => pools.releaseAll(), [pools]);

  useImperativeHandle(
    handleRef,
    () => ({
      spawnRipple(at) {
        if (!Number.isFinite(at.x) || !Number.isFinite(at.z)) return;
        const entry = pools.ripple.acquire(now());
        entry.state.x = at.x;
        entry.state.z = at.z;
        invalidate();
      },
      lightLamp(lampIndex) {
        if (!Number.isInteger(lampIndex) || lampIndex < 0 || lampIndex >= lamps.length) return;
        const t = now();
        for (let s = 0; s < pools.glow.capacity; s++) {
          const e = pools.glow.entryAt(s);
          if (e.active && e.state.lampIndex === lampIndex) {
            e.startedAtMs = t;
            invalidate();
            return;
          }
        }
        pools.glow.acquire(t).state.lampIndex = lampIndex;
        invalidate();
      },
      activeCount: (kind) => pools.activeCount(kind),
    }),
    [pools, lamps, now, invalidate],
  );

  useFrame(() => {
    const t = now();
    const a = writeRippleInstances(ripple, pools.ripple, t, reducedMotion, waterSurfaceY, scratch.current);
    const b = writeLampGlowInstances(glow, pools.glow, lamps, lampHead, t, reducedMotion, scratch.current);
    if (a + b > 0) invalidate(); // keep the demand loop alive only while an effect is running
  });

  return (
    <>
      <primitive object={ripple.mesh} dispose={null} />
      <primitive object={glow.mesh} dispose={null} />
    </>
  );
}
