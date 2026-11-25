"use client";

import { useThree } from "@react-three/fiber";
import { useLayoutEffect, type JSX } from "react";
import { useKrathongAssets } from "@/components/models/loyKrathong";
import { LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import { applyFlameGlow } from "./sceneLook";

export interface SceneLightingProps {
  readonly preset: LightPresetId;
  readonly shadows: boolean; // getSceneRenderSettings(tier).shadows
  readonly shadowMapSizePx: number;
}

/**
 * World-fixed DAY / NIGHT light rig (MFW-47): background, hemisphere fill, ambient and one key light (sun / moon) with a
 * soft, never-black shadow (shadow.intensity < 1, PCF radius). Also writes the preset's flame glow into the shared
 * flame material. A preset change is an instant cut (no animation, so reduced motion needs no branch); no useFrame.
 */
export function SceneLighting({ preset, shadows, shadowMapSizePx }: SceneLightingProps): JSX.Element {
  const p = LIGHT_PRESETS[preset];
  const assets = useKrathongAssets();
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    applyFlameGlow(assets.material("flame"), LIGHT_PRESETS[preset].flame.emissiveIntensity);
    invalidate();
  }, [assets, preset, invalidate]);

  return (
    <>
      <color attach="background" args={[p.background]} />
      <hemisphereLight color={p.hemisphere.skyColor} groundColor={p.hemisphere.groundColor} intensity={p.hemisphere.intensity} />
      <ambientLight color={p.ambient.color} intensity={p.ambient.intensity} />
      <directionalLight
        color={p.key.color}
        intensity={p.key.intensity}
        position={p.key.position}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSizePx, shadowMapSizePx]}
        shadow-radius={p.key.shadow.radius}
        shadow-intensity={p.key.shadow.intensity}
        shadow-bias={p.key.shadow.bias}
        shadow-normalBias={p.key.shadow.normalBias}
      />
    </>
  );
}
