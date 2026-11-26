"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { InstancedMesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import type { InstanceTransform } from "@/core/world";
import { applyEmissiveIntensity, createInstancedPartGeometry, createInstancedPartMaterial } from "./geometry";
import { applyInstanceTransforms, partShadowProps } from "./instancing";

export interface InstancedPartProps {
  readonly name: string;
  readonly part: ScenePartSpec;
  readonly transforms: readonly InstanceTransform[];
  readonly shadows: boolean; // getSceneRenderSettings(tier).shadows
  readonly onClick?: (event: ThreeEvent<MouseEvent>) => void;
  /** Runtime emissive intensity (e.g. village lights per light preset, MFW-49): a uniform, so the material is not re-created. */
  readonly emissiveIntensity?: number;
  /** The drawn mesh (MFW-70 sway writer; MFW-50 lantern flicker on the lamp heads). */
  readonly meshRef?: RefObject<InstancedMesh | null>;
}

/** One draw call for every instance of a part; owns (and disposes) one geometry and one material. */
export function InstancedPart(props: InstancedPartProps) {
  const { name, part, transforms, shadows, onClick, emissiveIntensity } = props;
  // Flatness is baked into the normals so every instanced part shares one shader program (MFW-47 perf).
  const flat = part.material.flatShading;
  const geometry = useMemo(() => createInstancedPartGeometry(part.geometry, flat), [part.geometry, flat]);
  const material = useMemo(() => createInstancedPartMaterial(part.material), [part.material]);
  const ownRef = useRef<InstancedMesh | null>(null);
  const meshRef = props.meshRef ?? ownRef;
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
  }, [geometry, material, transforms, part, invalidate, meshRef]);

  useLayoutEffect(() => {
    if (emissiveIntensity === undefined) return;
    applyEmissiveIntensity(material, emissiveIntensity);
    invalidate();
  }, [material, emissiveIntensity, invalidate]);

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
