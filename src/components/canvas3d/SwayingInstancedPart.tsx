"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type JSX } from "react";
import { InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { FoliageInstance, FoliageSwayParams } from "@/core/world";
import { createFoliageSwayScratch, writeFoliageSway } from "./foliageSway";
import { InstancedPart } from "./InstancedPart";
import { applyInstanceTransforms } from "./instancing";

export interface SwayingInstancedPartProps {
  readonly name: string;
  readonly part: ScenePartSpec;
  readonly instances: readonly FoliageInstance[];
  readonly shadows: boolean;
  readonly sway: FoliageSwayParams | null; // null = static rest pose (LOW, reduced motion)
  readonly now: () => number; // ms clock
}

/**
 * An InstancedPart whose instances lean in a gentle wind (MFW-70 AC4). The shear is written on frames the scene already
 * renders; it never calls invalidate() and sets no interval (WaterGlints rule D7, look doc section 11, item 5). With `sway` null the rest
 * pose is restored once. Creates no three resource: InstancedPart owns and disposes the geometry and material.
 */
export function SwayingInstancedPart({ name, part, instances, shadows, sway, now }: SwayingInstancedPartProps): JSX.Element {
  const meshRef = useRef<InstancedMesh | null>(null);
  const [scratch] = useState(createFoliageSwayScratch);
  const invalidate = useThree((s) => s.invalidate);

  // Runs after the child InstancedPart's own layout effect, so the mesh already matches `instances`.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (sway !== null || !(mesh instanceof InstancedMesh)) return;
    applyInstanceTransforms(mesh, instances, part);
    invalidate();
  }, [sway, instances, part, invalidate]);

  useFrame(() => {
    if (sway === null) return;
    const mesh = meshRef.current;
    if (!(mesh instanceof InstancedMesh)) return;
    writeFoliageSway(mesh, instances, part, now(), sway, scratch);
  });

  return <InstancedPart name={name} part={part} transforms={instances} shadows={shadows} meshRef={meshRef} />;
}
