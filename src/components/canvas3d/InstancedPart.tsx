"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";
import { createInstancedPartGeometry, createInstancedPartMaterial } from "./geometry";
import { applyInstanceTransforms, partShadowProps } from "./instancing";

export interface InstancedPartProps {
  readonly name: string;
  readonly part: ScenePartSpec;
  readonly transforms: readonly InstanceTransform[];
  readonly shadows: boolean; // getSceneRenderSettings(tier).shadows
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

/** One draw call for every instance of a part; owns (and disposes) one geometry and one material. */
export function InstancedPart({ name, part, transforms, shadows, onClick }: InstancedPartProps) {
  // Flatness is baked into the normals so every instanced part shares one shader program (MFW-47 perf).
  const flat = part.material.flatShading;
  const geometry = useMemo(() => createInstancedPartGeometry(part.geometry, flat), [part.geometry, flat]);
  const material = useMemo(() => createInstancedPartMaterial(part.material), [part.material]);
  const meshRef = useRef<InstancedMesh | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!(mesh instanceof InstancedMesh)) return; // the DOM test stub renders a plain element
    applyInstanceTransforms(mesh, transforms, part);
    invalidate();
  }, [geometry, material, transforms, part, invalidate]);

  if (transforms.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, transforms.length]}
      {...partShadowProps(part, shadows)}
      onClick={onClick}
    />
  );
}
