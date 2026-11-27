"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { KRATHONG_HERO_LOD } from "@/config/krathongModel.config";
import { designFlameParts } from "@/core/customization";
import { useKrathongAssets } from "./KrathongAssetsProvider";
import { createDesignHeroMesh } from "./designHeroMesh";
import type { KrathongDesignAsset } from "./krathongAssets";

export interface DesignKrathongModelProps {
  readonly asset: KrathongDesignAsset;
  readonly shadows: boolean;
}

/**
 * The hero krathong drawn from an owner-supplied design (MFW-65): the vertex-coloured body plus the procedural MFW-69 flame
 * on every flame anchor of the design (shared flame geometry, material, glow and flicker). The flames tilt with the body.
 */
export function DesignKrathongModel({ asset, shadows }: DesignKrathongModelProps) {
  const assets = useKrathongAssets();
  // MFW-78: the mesh records asset.design; `asset` covers it in the deps (exhaustive-deps flags asset.design as unnecessary).
  const mesh = useMemo(() => createDesignHeroMesh(asset.geometry, assets.designMaterial, asset.design), [asset, assets]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const flames = useMemo(() => designFlameParts(asset.flames), [asset]);
  const flameRefs = useRef<(Mesh | null)[]>([]);
  // One frame callback for every flame of the design; allocation-free.
  useFrame(() => {
    const f = assets.flameFlicker;
    const refs = flameRefs.current;
    for (let i = 0; i < flames.length; i++) {
      const flame = refs[i];
      if (!flame) continue;
      const s = flames[i].scale;
      flame.scale.set(s[0] * f.widthScale, s[1] * f.heightScale, s[2] * f.widthScale);
    }
  });
  return (
    <>
      <primitive object={mesh} name={SCENE_OBJECT_NAMES.krathongDesignBody} castShadow={shadows} receiveShadow={false} />
      {flames.map((part, i) => (
        <mesh
          key={part.id}
          ref={(node: Mesh | null) => {
            flameRefs.current[i] = node;
          }}
          name={part.id}
          geometry={assets.geometry("flame", KRATHONG_HERO_LOD)}
          material={assets.material("flame")}
          position={part.localPosition}
          scale={part.scale}
          castShadow={shadows}
          receiveShadow={false}
        />
      ))}
    </>
  );
}
