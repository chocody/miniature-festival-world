"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useSpring } from "@react-spring/three";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { OrthographicCamera, Vector3 } from "three";
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
import {
  createInputSeparator,
  getPinchZoomFactor,
  isCameraLocked,
  type InputSeparator,
  type InteractionAction,
  type InteractionMode,
  type InteractionTarget,
} from "@/core/interaction";
import { PAN_WORLD_UNITS_PER_PIXEL, ROTATION_RADIANS_PER_PIXEL } from "@/config/interaction.config";
import { KrathongAssetsProvider, KrathongModel } from "@/components/models/loyKrathong";
import { DEFAULT_KRATHONG_APPEARANCE, type KrathongAppearance } from "@/core/customization";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";

export const TOY_SCENE_CAMERA = {
  orthographic: true,
  position: [...CAMERA_FLIGHT_OFFSET] as [number, number, number],
  zoom: 52,
  near: 0.1,
  far: 40,
};

/** Stable `<Canvas camera>` options: one module-level object, so a re-render never re-applies the base zoom over a pinch zoom (MFW-44). */
export const TOY_SCENE_CANVAS_CAMERA = {
  position: TOY_SCENE_CAMERA.position,
  zoom: TOY_SCENE_CAMERA.zoom,
  near: TOY_SCENE_CAMERA.near,
  far: TOY_SCENE_CAMERA.far,
};

export const TOY_SCENE_LIGHTING = {
  background: "#101a32",
  ambient: { color: "#8499c5", intensity: 0.75 },
  moon: { color: "#bdceff", intensity: 1.15, position: [-4, 7, 3] as [number, number, number] },
  candle: { color: "#ffb35c", intensity: 14, distance: 7, position: [0.15, 1.25, 0.1] as [number, number, number] },
};

export const TOY_MATTE_MATERIALS = {
  water: { color: "#243d65", roughness: 1, metalness: 0 },
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
  appearance: KrathongAppearance;
  objectRotation: number;
  worldRotation: number;
  worldOffset: readonly [number, number];
  onTargetSelected: (target: CameraTargetKind) => void;
  waterTargetRef: RefObject<Mesh | null>;
  krathongTargetRef: RefObject<Group | null>;
  lampTargetRef: RefObject<Mesh | null>;
}

function ToyNightScene({
  shadows,
  appearance,
  objectRotation,
  worldRotation,
  worldOffset,
  onTargetSelected,
  waterTargetRef,
  krathongTargetRef,
  lampTargetRef,
}: ToyNightSceneProps) {
  return (
    <>
      <color attach="background" args={[TOY_SCENE_LIGHTING.background]} />
      <group position={[worldOffset[0], 0, worldOffset[1]]} rotation={[0, worldRotation, 0]}>
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
        name="scene-water"
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
        rotation={[0, objectRotation, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onTargetSelected("krathong");
        }}
      >
        <KrathongModel appearance={appearance} shadows={shadows} />
      </group>
      <mesh
        name="scene-lamp"
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
      </group>
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

/** A profiler-gated look-development viewport with tier-aware rendering and target focus. */
export function SceneViewport({
  mode = null,
  onGestureRelease,
}: {
  mode?: InteractionMode | null;
  onGestureRelease?: () => void;
}) {
  const profiled = useDeviceStore((state) => state.profiled);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const reducedMotion = useDeviceStore((state) => state.reducedMotion);
  const builderAppearance = useBuilderStore((state) => state.appearance);
  const appearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE;
  const viewportRef = useRef<HTMLElement>(null);
  const [objectRotation, setObjectRotation] = useState(0);
  const [worldRotation, setWorldRotation] = useState(0);
  const [worldOffset, setWorldOffset] = useState<[number, number]>([0, 0]);
  const [krathongPosition, setKrathongPosition] = useState<[number, number]>([50, 55]);
  const [lastInteraction, setLastInteraction] = useState<InteractionTarget | null>(null);
  const zoomRef = useRef(1);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const inputSeparatorRef = useRef<{ mode: InteractionMode; input: InputSeparator } | null>(null);
  const waterTargetRef = useRef<Mesh | null>(null);
  const krathongTargetRef = useRef<Group | null>(null);
  const lampTargetRef = useRef<Mesh | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<CameraTargetKind | null>(null);
  const [flyRequestId, setFlyRequestId] = useState(0);
  const [selectionMode, setSelectionMode] = useState(mode);
  if (selectionMode !== mode) {
    setSelectionMode(mode);
    setSelectedTarget(null);
  }
  const onTargetSelected = useCallback((target: CameraTargetKind) => {
    // Only WORLD_EXPLORE has "แตะสั้นเพื่อ Interact"; RITUAL_RELEASE locks the camera and CUSTOMIZE only rotates/zooms.
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedTarget(target);
    setFlyRequestId((requestId) => requestId + 1);
  }, [mode]);

  const activeTargetRef = selectedTarget === "water"
    ? waterTargetRef
    : selectedTarget === "krathong"
      ? krathongTargetRef
      : selectedTarget === "lamp"
        ? lampTargetRef
        : null;

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
      data-selected-target={selectedTarget ?? undefined}
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
        camera={TOY_SCENE_CANVAS_CAMERA}
        dpr={settings.dpr}
        gl={{ antialias: true }}
        shadows={settings.shadows}
        frameloop="demand"
        onCreated={({ camera, invalidate }) => {
          cameraRef.current = camera instanceof OrthographicCamera ? camera : null;
          invalidateRef.current = invalidate;
        }}
      >
        <KrathongAssetsProvider>
          <ToyNightScene
            shadows={settings.shadows}
            appearance={appearance}
            objectRotation={objectRotation}
            worldRotation={worldRotation}
            worldOffset={worldOffset}
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
        </KrathongAssetsProvider>
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
