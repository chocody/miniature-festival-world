"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import { createNudgeFrame, type NudgeSource } from "@/core/effects";
import type { FoliageInstance, FoliageOwnerRef, FoliageSwayParams } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { createFoliageSwayScratch, writeFoliageSwayAndShake, type FoliageShakeInput } from "./foliageSway";
import { InstancedPart } from "./InstancedPart";
import { applyInstanceTransforms } from "./instancing";

export interface SwayingInstancedPartProps {
  readonly name: string;
  readonly part: ScenePartSpec;
  readonly instances: readonly FoliageInstance[];
  readonly shadows: boolean;
  readonly sway: FoliageSwayParams | null; // null = static rest pose (LOW, reduced motion)
  readonly now: () => number; // ms clock
  /** MFW-60: owner of each instance (parallel to `instances`) and the shared nudge pool: a tapped tree / bush / reed shakes. */
  readonly shakeOwners?: readonly FoliageOwnerRef[];
  readonly nudges?: NudgeSource | null;
}

/**
 * An InstancedPart whose instances lean in a gentle wind (MFW-70 AC4) and shake when their owner is tapped (MFW-60). The shear is
 * written on frames the scene already renders; it never calls invalidate() and sets no interval (WaterGlints rule D7, look doc
 * section 11, item 5): SceneEffects keeps the demand loop alive while a nudge runs. With `sway` null the rest pose is restored once,
 * and a shake is written while it runs plus one tail frame (rest pose). Creates no three resource: InstancedPart owns and disposes
 * the geometry and material.
 */
export function SwayingInstancedPart(props: SwayingInstancedPartProps): JSX.Element {
  const { name, part, instances, shadows, sway, now, shakeOwners, nudges } = props;
  const meshRef = useRef<InstancedMesh | null>(null);
  const [scratch] = useState(createFoliageSwayScratch);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  /** The tap-shake input, re-made only when the pool or the owners change; nowMs / reducedMotion are refreshed per frame. */
  const shakeRef = useRef<FoliageShakeInput | null>(null);
  const wasShaking = useRef(false);
  useLayoutEffect(() => {
    shakeRef.current =
      nudges && shakeOwners
        ? { pool: nudges.pool, owners: shakeOwners, nowMs: 0, reducedMotion: false, frame: createNudgeFrame() }
        : null;
  }, [nudges, shakeOwners]);

  // Runs after the child InstancedPart's own layout effect, so the mesh already matches `instances`.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (sway !== null || !(mesh instanceof InstancedMesh)) return;
    applyInstanceTransforms(mesh, instances, part);
    invalidate();
  }, [sway, instances, part, invalidate]);

  useFrame(() => {
    const shake = shakeRef.current;
    const shaking = shake !== null && shake.pool.activeCount > 0;
    if (sway === null && !shaking && !wasShaking.current) return;
    const mesh = meshRef.current;
    if (!(mesh instanceof InstancedMesh)) return;
    if (shake !== null && nudges) {
      shake.nowMs = nudges.now();
      shake.reducedMotion = reducedMotion;
    }
    wasShaking.current = writeFoliageSwayAndShake(mesh, instances, part, now(), sway, shake, scratch);
  });

  return <InstancedPart name={name} part={part} transforms={instances} shadows={shadows} meshRef={meshRef} />;
}
