"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useRef, useState, type PointerEvent } from "react";
import { OrthographicCamera } from "three";
import type { QualityTier, RenderTier } from "@/config/performance.config";
import { TIER_BUDGETS } from "@/config/performance.config";
import {
  createInputSeparator,
  isCameraLocked,
  getPinchZoomFactor,
  type InteractionAction,
  type InteractionMode,
  type InteractionTarget,
  type InputSeparator,
} from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { PAN_WORLD_UNITS_PER_PIXEL, ROTATION_RADIANS_PER_PIXEL } from "@/config/interaction.config";

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

interface ToyNightSceneProps {
  shadows: boolean;
  objectRotation: number;
  worldRotation: number;
  worldOffset: readonly [number, number];
}

function ToyNightScene({ shadows, objectRotation, worldRotation, worldOffset }: ToyNightSceneProps) {
  return (
    <group position={[worldOffset[0], 0, worldOffset[1]]} rotation={[0, worldRotation, 0]}>
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
      <group rotation={[0, objectRotation, 0]}>
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
      <mesh position={[-1.45, 0.1, -1.05]}>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.moon} emissive="#5c4c27" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function readTarget(target: EventTarget | null): InteractionTarget | null {
  if (!(target instanceof Element)) return null;
  const value = target.closest<HTMLElement>("[data-input-target]")?.dataset.inputTarget;
  return value === "krathong" || value === "water" || value === "lamp" ? value : null;
}

function pointSample(event: PointerEvent<HTMLElement>, target: InteractionTarget | null) {
  return {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp,
    target,
  };
}

/** A static look-development viewport. It only mounts after profiling has selected a 3D tier. */
export function SceneViewport({
  mode = null,
  onGestureRelease,
}: {
  mode?: InteractionMode | null;
  onGestureRelease?: () => void;
}) {
  const profiled = useDeviceStore((state) => state.profiled);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const viewportRef = useRef<HTMLElement>(null);
  const [objectRotation, setObjectRotation] = useState(0);
  const [worldRotation, setWorldRotation] = useState(0);
  const [worldOffset, setWorldOffset] = useState<[number, number]>([0, 0]);
  const [krathongPosition, setKrathongPosition] = useState<[number, number]>([50, 55]);
  const [lastInteraction, setLastInteraction] = useState<InteractionTarget | null>(null);
  const zoomRef = useRef(1);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);

  const onAction = useCallback((action: InteractionAction) => {
    switch (action.type) {
      case "ROTATE_KRATHONG":
        setObjectRotation((value) => value + action.deltaX * ROTATION_RADIANS_PER_PIXEL);
        break;
      case "PINCH_ZOOM":
        zoomRef.current = getPinchZoomFactor(zoomRef.current, action.scale);
        if (cameraRef.current) {
          cameraRef.current.zoom = TOY_SCENE_CAMERA.zoom * zoomRef.current;
          cameraRef.current.updateProjectionMatrix();
          invalidateRef.current?.();
        }
        break;
      case "DRAG_KRATHONG": {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) break;
        setKrathongPosition(([x, y]) => [
          Math.max(8, Math.min(92, x + (action.deltaX / rect.width) * 100)),
          Math.max(8, Math.min(92, y + (action.deltaY / rect.height) * 100)),
        ]);
        break;
      }
      case "RELEASE_KRATHONG":
        onGestureRelease?.();
        break;
      case "PAN_RIVER":
        setWorldOffset(([x, y]) => [
          x - action.deltaX * PAN_WORLD_UNITS_PER_PIXEL,
          y - action.deltaY * PAN_WORLD_UNITS_PER_PIXEL,
        ]);
        setWorldRotation((value) => value + action.deltaX * ROTATION_RADIANS_PER_PIXEL);
        break;
      case "TAP_INTERACT":
        setLastInteraction(action.target);
        break;
    }
  }, [onGestureRelease]);

  const inputSeparatorRef = useRef<{ mode: InteractionMode; input: InputSeparator } | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (!mode) return;
    if (inputSeparatorRef.current?.mode !== mode) {
      inputSeparatorRef.current = { mode, input: createInputSeparator(mode, onAction) };
    }
    const target = readTarget(event.target);
    if (mode === "RITUAL_RELEASE" && target !== "krathong") return;
    inputSeparatorRef.current.input.pointerDown(pointSample(event, target ?? (mode === "WORLD_EXPLORE" ? "water" : null)));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (inputSeparatorRef.current?.mode === mode) {
      inputSeparatorRef.current.input.pointerMove(pointSample(event, readTarget(event.target)));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (inputSeparatorRef.current?.mode !== mode) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const insideViewport = rect !== undefined && rect !== null &&
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    const target = readTarget(event.target) ??
      (mode === "RITUAL_RELEASE" && insideViewport ? "water" : mode === "WORLD_EXPLORE" ? "water" : null);
    inputSeparatorRef.current.input.pointerUp(pointSample(event, target));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLElement>) {
    if (inputSeparatorRef.current?.mode === mode) {
      inputSeparatorRef.current.input.pointerCancel(event.pointerId);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!profiled || qualityTier === "FALLBACK_2D") return null;

  const settings = getSceneRenderSettings(qualityTier as Exclude<QualityTier, "FALLBACK_2D">);

  return (
    <section
      aria-label="Toy-like night river preview"
      className="relative mb-8 h-64 w-full touch-none select-none overflow-hidden rounded-3xl border border-indigo-950/30 bg-[#101a32] shadow-lg"
      data-quality-tier={qualityTier}
      data-interaction-mode={mode ?? undefined}
      data-camera-locked={mode ? String(isCameraLocked(mode)) : undefined}
      data-last-interaction={lastInteraction ?? undefined}
      data-input-target={mode === "WORLD_EXPLORE" ? "water" : undefined}
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <Canvas
        aria-label="Orthographic toy-like night river scene"
        orthographic={TOY_SCENE_CAMERA.orthographic}
        camera={{ position: TOY_SCENE_CAMERA.position, zoom: TOY_SCENE_CAMERA.zoom, near: TOY_SCENE_CAMERA.near, far: TOY_SCENE_CAMERA.far }}
        dpr={settings.dpr}
        gl={{ antialias: true }}
        shadows={settings.shadows}
        frameloop="demand"
        onCreated={({ camera, invalidate }) => {
          cameraRef.current = camera instanceof OrthographicCamera ? camera : null;
          invalidateRef.current = invalidate;
        }}
      >
        <ToyNightScene
          shadows={settings.shadows}
          objectRotation={objectRotation}
          worldRotation={worldRotation}
          worldOffset={worldOffset}
        />
      </Canvas>
      {mode === "RITUAL_RELEASE" && (
        <div
          role="img"
          aria-label="กระทง ลากลงน้ำ"
          className="absolute z-10 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab place-items-center rounded-full border-2 border-amber-200 bg-amber-400/80 text-xs font-semibold text-amber-950 shadow-lg active:cursor-grabbing"
          data-input-target="krathong"
          style={{ left: `${krathongPosition[0]}%`, top: `${krathongPosition[1]}%` }}
        >
          กระทง
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {lastInteraction ? `Selected ${lastInteraction}` : ""}
      </span>
    </section>
  );
}
