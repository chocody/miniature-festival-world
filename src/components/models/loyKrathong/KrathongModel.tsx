"use client";

import { memo, useMemo } from "react";
import { assembleKrathong, type KrathongAppearance, type KrathongPartInstance } from "@/core/customization";
import { useKrathongAssets } from "./KrathongAssetsProvider";
import { UprightAnchor } from "./UprightAnchor";

export interface KrathongModelProps {
  appearance: KrathongAppearance;
  shadows: boolean;
}

function KrathongModelImpl({ appearance, shadows }: KrathongModelProps) {
  const assets = useKrathongAssets();
  const assembly = useMemo(() => assembleKrathong(appearance), [appearance]);
  const renderPart = (part: KrathongPartInstance) => (
    <mesh
      key={part.id}
      name={part.id}
      geometry={assets.geometry(part.geometryKey)}
      material={assets.material(part.materialKey)}
      position={part.localPosition}
      rotation={[0, part.rotationY, 0]}
      scale={part.scale}
      castShadow={shadows}
      receiveShadow={shadows && part.role === "base"}
    />
  );
  return (
    <group name="krathong-model">
      {assembly.body.map(renderPart)}
      <UprightAnchor name={assembly.centerAnchor.socketId} position={assembly.centerAnchor.localPosition}>
        {assembly.centerAnchor.parts.map(renderPart)}
      </UprightAnchor>
    </group>
  );
}

export const KrathongModel = memo(KrathongModelImpl);
