"use client";

import { useEffect, useMemo } from "react";
import { InstancedMesh, Matrix4, type BufferGeometry, type MeshStandardMaterial } from "three";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import type { OrnamentDesignId } from "@/config/ornamentDesigns.config";
import { ORNAMENT_HERO_LOD, type OrnamentLod } from "@/config/ornamentModels.config";
import { useOrnamentAssets, useOrnamentDesign } from "./OrnamentAssetsProvider";
import type { OrnamentAssets, OrnamentDesignAsset } from "./ornamentAssets";

const IDENTITY = new Matrix4();

/** userData key holding the design id of the hero ornament (MFW-101). */
export const ORNAMENT_DESIGN_USERDATA_KEY = "ornamentDesign";

export interface OrnamentHeroSource {
  readonly kind: "glb" | "fallback";
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
}

/** A loaded design draws its body with the shared vertex-colour material; otherwise the tinted fallback sphere. */
export function selectOrnamentHeroSource(assets: OrnamentAssets, design: OrnamentDesignId, asset: OrnamentDesignAsset | null): OrnamentHeroSource {
  if (asset !== null) return { kind: "glb", geometry: asset.geometry, material: assets.designMaterial };
  return { kind: "fallback", geometry: assets.fallbackGeometry, material: assets.fallbackMaterial(design) };
}

/**
 * The hero ornament: a 1-instance InstancedMesh, so it shares the program with the instanced tree batches (the L16 tree-ornaments card). The
 * geometry and material belong to the ornament assets: dispose only the mesh (its instance buffer), never them.
 */
export function createOrnamentHeroMesh(geometry: BufferGeometry, material: MeshStandardMaterial, design: OrnamentDesignId, name: string): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, IDENTITY);
  mesh.userData[ORNAMENT_DESIGN_USERDATA_KEY] = design;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  return mesh;
}

export interface OrnamentModelProps {
  readonly design: OrnamentDesignId;
  /** Default ORNAMENT_HERO_LOD. */
  readonly lod?: OrnamentLod;
}

/**
 * One ornament (MFW-101): the owner-made model once loaded, the tinted fallback sphere before that or after a failure.
 * Static: no frame callback, so reduced motion needs no branch. No shadows (plan L16, DRAFT).
 */
export function OrnamentModel({ design, lod = ORNAMENT_HERO_LOD }: OrnamentModelProps) {
  const assets = useOrnamentAssets();
  const asset = useOrnamentDesign(design, lod);
  const source = selectOrnamentHeroSource(assets, design, asset);
  const name = source.kind === "glb" ? SCENE_OBJECT_NAMES.ornamentDesignBody : SCENE_OBJECT_NAMES.ornamentFallback;
  const { geometry, material } = source;
  const mesh = useMemo(() => createOrnamentHeroMesh(geometry, material, design, name), [geometry, material, design, name]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} name={name} castShadow={false} receiveShadow={false} />;
}
