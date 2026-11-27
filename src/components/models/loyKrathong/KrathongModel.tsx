"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { KRATHONG_HERO_LOD } from "@/config/krathongModel.config";
import { assembleKrathong, krathongDesignForAppearance, type KrathongAppearance, type KrathongPartInstance } from "@/core/customization";
import { DesignKrathongModel } from "./DesignKrathongModel";
import { useKrathongAssets, useKrathongDesign } from "./KrathongAssetsProvider";
import type { KrathongDesignAsset } from "./krathongAssets";
import { UprightAnchor } from "./UprightAnchor";

export interface KrathongModelProps {
  appearance: KrathongAppearance;
  shadows: boolean;
}

interface PartMeshProps {
  readonly part: KrathongPartInstance;
  readonly shadows: boolean;
}

/** The flame part: same mesh as every other part, scaled per frame by the canvas-shared flicker (MFW-48). Allocation-free. */
function FlameMesh({ part, shadows }: PartMeshProps) {
  const assets = useKrathongAssets();
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    if (mesh === null) return;
    const f = assets.flameFlicker;
    mesh.scale.set(part.scale[0] * f.widthScale, part.scale[1] * f.heightScale, part.scale[2] * f.widthScale);
  });
  return (
    <mesh
      ref={ref}
      name={part.id}
      geometry={assets.geometry(part.geometryKey, KRATHONG_HERO_LOD)}
      material={assets.material(part.materialKey)}
      position={part.localPosition}
      rotation={[0, part.rotationY, 0]}
      scale={part.scale}
      castShadow={shadows}
      receiveShadow={false}
    />
  );
}

/**
 * MFW-78: `asset` when it is loaded, else the last design asset this component instance showed (null if none yet), so a design
 * switch keeps the previous design on screen while the new file loads instead of flashing the procedural krathong.
 * "Storing information from previous renders" pattern: a guarded setState during render, no ref read and no effect.
 */
function useLastShownDesign(asset: KrathongDesignAsset | null): KrathongDesignAsset | null {
  const [last, setLast] = useState<KrathongDesignAsset | null>(null);
  if (asset !== null && asset !== last) setLast(asset);
  return asset ?? last;
}

function KrathongModelImpl({ appearance, shadows }: KrathongModelProps) {
  const assets = useKrathongAssets();
  // MFW-65: the owner-supplied design once loaded (after the tier is decided); the procedural model until then or on failure.
  // MFW-78: while a newly chosen design loads, the last shown design stays.
  const design = useLastShownDesign(useKrathongDesign(krathongDesignForAppearance(appearance), KRATHONG_HERO_LOD));
  const assembly = useMemo(() => assembleKrathong(appearance), [appearance]);
  if (design !== null) {
    return (
      <group name="krathong-model">
        <DesignKrathongModel asset={design} shadows={shadows} />
      </group>
    );
  }
  const renderPart = (part: KrathongPartInstance) =>
    part.role === "flame" ? (
      <FlameMesh key={part.id} part={part} shadows={shadows} />
    ) : (
      <mesh
        key={part.id}
        name={part.id}
        geometry={assets.geometry(part.geometryKey, KRATHONG_HERO_LOD)}
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
