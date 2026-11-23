"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useSpring } from "@react-spring/three";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import type { Group, Mesh, Object3D } from "three";
import {
  CAMERA_FLIGHT_OFFSET,
  CAMERA_FLIGHT_SPRING_CONFIG,
  HIGHLIGHT_RING_SIZES,
} from "@/config/camera.config";
import type { QualityTier, RenderTier } from "@/config/performance.config";
import { TIER_BUDGETS } from "@/config/performance.config";
import { createCameraController, updateHighlightPosition } from "@/core/camera";
import type { CameraTargetKind } from "@/core/camera";
import { useDeviceStore } from "@/store/useDeviceStore";

export const TOY_SCENE_CAMERA = {
  orthographic: true,
  position: [...CAMERA_FLIGHT_OFFSET] as [number, number, number],
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

type TargetRef = RefObject<Object3D | null>;

interface ToyNightSceneProps {
  shadows: boolean;
  onTargetSelected: (target: CameraTargetKind) => void;
  waterTargetRef: RefObject<Mesh | null>;
  krathongTargetRef: RefObject<Group | null>;
  lampTargetRef: RefObject<Mesh | null>;
}

function ToyNightScene({
  shadows,
  onTargetSelected,
  waterTargetRef,
  krathongTargetRef,
  lampTargetRef,
}: ToyNightSceneProps) {
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
      <mesh
        ref={waterTargetRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.24, 0]}
        receiveShadow={shadows}
        onClick={(event) => {
          event.stopPropagation();
          onTargetSelected("water");
        }}
      >
        <circleGeometry args={[3.1, 48]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.water} />
      </mesh>
      <group
        ref={krathongTargetRef}
        onClick={(event) => {
          event.stopPropagation();
          onTargetSelected("krathong");
        }}
      >
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
      </group>
      <mesh
        ref={lampTargetRef}
        position={[-1.45, 0.1, -1.05]}
        onClick={(event) => {
          event.stopPropagation();
          onTargetSelected("lamp");
        }}
      >
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.moon} emissive="#5c4c27" emissiveIntensity={0.2} />
      </mesh>
    </>
  );
}

function CameraFlightController({
  targetRef,
  requestId,
  reducedMotion,
}: {
  targetRef: TargetRef;
  requestId: number;
  reducedMotion: boolean;
}) {
  const worldTarget = useRef(new Vector3());
  const invalidate = useThree((state) => state.invalidate);
  const [springs, api] = useSpring(() => ({
    cameraX: Number(CAMERA_FLIGHT_OFFSET[0]),
    cameraY: Number(CAMERA_FLIGHT_OFFSET[1]),
    cameraZ: Number(CAMERA_FLIGHT_OFFSET[2]),
    focusX: 0,
    focusY: 0,
    focusZ: 0,
    config: { ...CAMERA_FLIGHT_SPRING_CONFIG },
    onChange: invalidate,
  }));

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    target.getWorldPosition(worldTarget.current);
    createCameraController(
      { start: (options) => void api.start(options) },
      reducedMotion,
    ).flyTo(worldTarget.current);
  }, [api, reducedMotion, requestId, targetRef]);

  useFrame(({ camera }) => {
    camera.position.set(springs.cameraX.get(), springs.cameraY.get(), springs.cameraZ.get());
    camera.lookAt(springs.focusX.get(), springs.focusY.get(), springs.focusZ.get());
  });

  return null;
}

function TargetHighlight({ targetRef, target }: { targetRef: TargetRef; target: CameraTargetKind }) {
  const ringRef = useRef<Mesh | null>(null);
  const worldTarget = useRef(new Vector3());
  const ringSize = HIGHLIGHT_RING_SIZES[target];

  useFrame(() => {
    const target = targetRef.current;
    const ring = ringRef.current;
    if (!target || !ring) return;
    target.getWorldPosition(worldTarget.current);
    updateHighlightPosition(worldTarget.current, ring.position, ringSize.heightOffset);
  });

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[ringSize.innerRadius, ringSize.outerRadius, 32]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

/** A profiler-gated look-development viewport with tier-aware rendering and target focus. */
export function SceneViewport() {
  const profiled = useDeviceStore((state) => state.profiled);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const reducedMotion = useDeviceStore((state) => state.reducedMotion);
  const waterTargetRef = useRef<Mesh | null>(null);
  const krathongTargetRef = useRef<Group | null>(null);
  const lampTargetRef = useRef<Mesh | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<CameraTargetKind | null>(null);
  const [flyRequestId, setFlyRequestId] = useState(0);
  const onTargetSelected = useCallback((target: CameraTargetKind) => {
    setSelectedTarget(target);
    setFlyRequestId((requestId) => requestId + 1);
  }, []);

  const activeTargetRef = selectedTarget === "water"
    ? waterTargetRef
    : selectedTarget === "krathong"
      ? krathongTargetRef
      : selectedTarget === "lamp"
        ? lampTargetRef
        : null;

  if (!profiled || qualityTier === "FALLBACK_2D") return null;

  const settings = getSceneRenderSettings(qualityTier as Exclude<QualityTier, "FALLBACK_2D">);

  return (
    <section
      aria-label="Toy-like night river preview"
      className="mb-8 h-64 w-full overflow-hidden rounded-3xl border border-indigo-950/30 bg-[#101a32] shadow-lg"
      data-quality-tier={qualityTier}
      data-selected-target={selectedTarget ?? undefined}
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
        <ToyNightScene
          shadows={settings.shadows}
          onTargetSelected={onTargetSelected}
          waterTargetRef={waterTargetRef}
          krathongTargetRef={krathongTargetRef}
          lampTargetRef={lampTargetRef}
        />
        {activeTargetRef && selectedTarget && (
          <>
            <CameraFlightController
              targetRef={activeTargetRef}
              requestId={flyRequestId}
              reducedMotion={reducedMotion}
            />
            <TargetHighlight targetRef={activeTargetRef} target={selectedTarget} />
          </>
        )}
      </Canvas>
    </section>
  );
}
