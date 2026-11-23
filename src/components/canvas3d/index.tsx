"use client";

import { Canvas } from "@react-three/fiber";
import type { QualityTier, RenderTier } from "@/config/performance.config";
import { TIER_BUDGETS } from "@/config/performance.config";
import { useDeviceStore } from "@/store/useDeviceStore";

export const TOY_SCENE_CAMERA = {
  orthographic: true,
  position: [4.5, 5.5, 7] as [number, number, number],
  zoom: 52,
  near: 0.1,
  far: 40,
};

export const TOY_SCENE_LIGHTING = {
  background: "#101a32",
  ambient: { color: "#8499c5", intensity: 0.75 },
  moon: { color: "#bdceff", intensity: 1.15, position: [-4, 7, 3] as [number, number, number] },
  candle: { color: "#ffb35c", intensity: 14, distance: 7, position: [0.15, 1.25, 0.1] as [number, number, number] },
};

export const TOY_MATTE_MATERIALS = {
  water: { color: "#243d65", roughness: 1, metalness: 0 },
  island: { color: "#536e74", roughness: 1, metalness: 0 },
  pebble: { color: "#91a88f", roughness: 1, metalness: 0 },
  moon: { color: "#e7d7aa", roughness: 1, metalness: 0 },
};

export interface SceneRenderSettings {
  dpr: [number, number];
  shadows: boolean;
  maxTextureSize: number;
}

export function getSceneRenderSettings(tier: RenderTier): SceneRenderSettings {
  const budget = TIER_BUDGETS[tier];
  return {
    dpr: [1, budget.pixelRatioCap],
    shadows: budget.shadows,
    maxTextureSize: budget.maxTextureSize,
  };
}

function ToyNightScene({ shadows }: { shadows: boolean }) {
  return (
    <>
      <color attach="background" args={[TOY_SCENE_LIGHTING.background]} />
      <ambientLight color={TOY_SCENE_LIGHTING.ambient.color} intensity={TOY_SCENE_LIGHTING.ambient.intensity} />
      <directionalLight
        color={TOY_SCENE_LIGHTING.moon.color}
        intensity={TOY_SCENE_LIGHTING.moon.intensity}
        position={TOY_SCENE_LIGHTING.moon.position}
        castShadow={shadows}
      />
      <pointLight
        color={TOY_SCENE_LIGHTING.candle.color}
        intensity={TOY_SCENE_LIGHTING.candle.intensity}
        distance={TOY_SCENE_LIGHTING.candle.distance}
        position={TOY_SCENE_LIGHTING.candle.position}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow={shadows}>
        <circleGeometry args={[3.1, 48]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.water} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[1.18, 1.32, 0.42, 12]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.island} />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow={shadows}>
        <sphereGeometry args={[0.32, 16, 12]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.pebble} />
      </mesh>
      <mesh position={[-0.66, 0.28, 0.2]} castShadow={shadows}>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.pebble} />
      </mesh>
      <mesh position={[0.55, 0.27, -0.3]} castShadow={shadows}>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.pebble} />
      </mesh>
      <mesh position={[-1.45, 0.1, -1.05]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.moon} emissive="#5c4c27" emissiveIntensity={0.2} />
      </mesh>
    </>
  );
}

/** A static look-development viewport. It only mounts after profiling has selected a 3D tier. */
export function SceneViewport() {
  const profiled = useDeviceStore((state) => state.profiled);
  const qualityTier = useDeviceStore((state) => state.qualityTier);

  if (!profiled || qualityTier === "FALLBACK_2D") return null;

  const settings = getSceneRenderSettings(qualityTier as Exclude<QualityTier, "FALLBACK_2D">);

  return (
    <section
      aria-label="Toy-like night river preview"
      className="mb-8 h-64 w-full overflow-hidden rounded-3xl border border-indigo-950/30 bg-[#101a32] shadow-lg"
      data-quality-tier={qualityTier}
    >
      <Canvas
        aria-label="Orthographic toy-like night river scene"
        orthographic={TOY_SCENE_CAMERA.orthographic}
        camera={{ position: TOY_SCENE_CAMERA.position, zoom: TOY_SCENE_CAMERA.zoom, near: TOY_SCENE_CAMERA.near, far: TOY_SCENE_CAMERA.far }}
        dpr={settings.dpr}
        gl={{ antialias: true }}
        shadows={settings.shadows}
        frameloop="demand"
      >
        <ToyNightScene shadows={settings.shadows} />
      </Canvas>
    </section>
  );
}
