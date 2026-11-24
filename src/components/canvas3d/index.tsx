"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useSpring } from "@react-spring/three";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
  type RefObject,
} from "react";
import { OrthographicCamera, Vector3 } from "three";
import type { Group, Mesh, Object3D } from "three";
import {
  CAMERA_FLIGHT_OFFSET,
  CAMERA_FLIGHT_SPRING_CONFIG,
  HIGHLIGHT_RING_COLOR,
  HIGHLIGHT_RING_OPACITY,
  HIGHLIGHT_RING_SEGMENTS,
  HIGHLIGHT_RING_SIZES,
  SCENE_CAMERA_FAR,
  SCENE_CAMERA_NEAR,
  SCENE_CAMERA_ZOOM,
} from "@/config/camera.config";
import type { QualityTier, RenderTier } from "@/config/performance.config";
import { TIER_ANTIALIAS, TIER_BUDGETS } from "@/config/performance.config";
import { MOON_SHADOW_MAP_SIZE_PX, TOY_SCENE_LIGHTING } from "@/config/scene.config";
import { createCameraController, updateHighlightPosition } from "@/core/camera";
import type { CameraTargetKind } from "@/core/camera";
import {
  createInputSeparator,
  getPinchZoomFactor,
  getRotationAfterDrag,
  getRotationAfterStep,
  getZoomFactorAfterStep,
  isCameraLocked,
  type CustomizeViewControl,
  type InputSeparator,
  type InteractionAction,
  type InteractionMode,
  type InteractionTarget,
} from "@/core/interaction";
import {
  PAN_WORLD_UNITS_PER_PIXEL,
  PERCENT_SCALE,
  RITUAL_CHIP_MAX_PERCENT,
  RITUAL_CHIP_MIN_PERCENT,
  RITUAL_CHIP_START_PERCENT,
  ROTATION_RADIANS_PER_PIXEL,
} from "@/config/interaction.config";
import {
  KrathongAssetsProvider,
  KrathongModel,
  LOY_KRATHONG_RIVER_LAYOUT,
  RiverEnvironment,
} from "@/components/models/loyKrathong";
import { getLoyKrathongRiverLanes } from "@/core/world";
import { PartChangeBounce } from "./PartChangeBounce";
import { RiverFlow, type RiverFlowItem } from "./RiverFlow";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { DEFAULT_KRATHONG_APPEARANCE, type KrathongAppearance } from "@/core/customization";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";

export { TOY_SCENE_LIGHTING, TOY_MATTE_MATERIALS } from "@/config/scene.config";

export const TOY_SCENE_CAMERA = {
  orthographic: true,
  position: [...CAMERA_FLIGHT_OFFSET] as [number, number, number],
  zoom: SCENE_CAMERA_ZOOM,
  near: SCENE_CAMERA_NEAR,
  far: SCENE_CAMERA_FAR,
};

/** Stable `<Canvas camera>` options: one module-level object, so a re-render never re-applies the base zoom over a pinch zoom (MFW-44). */
export const TOY_SCENE_CANVAS_CAMERA = {
  position: TOY_SCENE_CAMERA.position,
  zoom: TOY_SCENE_CAMERA.zoom,
  near: TOY_SCENE_CAMERA.near,
  far: TOY_SCENE_CAMERA.far,
};

/** Stable `gl` objects: the renderer reads antialias only at creation, and the Canvas key re-creates it when the value flips. */
const CANVAS_GL_ANTIALIAS_ON = { antialias: true };
const CANVAS_GL_ANTIALIAS_OFF = { antialias: false };

export interface SceneRenderSettings {
  dpr: [number, number];
  shadows: boolean;
  maxTextureSize: number;
  antialias: boolean;
  shadowMapSizePx: number;
}

export function getSceneRenderSettings(tier: RenderTier): SceneRenderSettings {
  const budget = TIER_BUDGETS[tier];
  return {
    dpr: [1, budget.pixelRatioCap],
    shadows: budget.shadows,
    maxTextureSize: budget.maxTextureSize,
    antialias: TIER_ANTIALIAS[tier],
    shadowMapSizePx: Math.min(MOON_SHADOW_MAP_SIZE_PX, budget.maxTextureSize),
  };
}

/** Default: no river krathongs until a zone data source exists (MFW-25). */
export const NO_RIVER_ITEMS: readonly RiverFlowItem[] = Object.freeze([]);

type TargetRef = RefObject<Object3D | null>;

interface ToyNightSceneProps {
  shadows: boolean;
  shadowMapSizePx: number;
  appearance: KrathongAppearance;
  reducedMotion: boolean;
  riverItems: readonly RiverFlowItem[];
  objectRotation: number;
  worldRotation: number;
  worldOffset: readonly [number, number];
  onTargetSelected: (target: CameraTargetKind) => void;
  selectedLampIndex: number;
  onLampSelected: (lampIndex: number) => void;
  waterTargetRef: RefObject<Mesh | null>;
  krathongTargetRef: RefObject<Group | null>;
  lampTargetRef: RefObject<Group | null>;
}

function ToyNightScene({
  shadows,
  shadowMapSizePx,
  appearance,
  reducedMotion,
  riverItems,
  objectRotation,
  worldRotation,
  worldOffset,
  onTargetSelected,
  selectedLampIndex,
  onLampSelected,
  waterTargetRef,
  krathongTargetRef,
  lampTargetRef,
}: ToyNightSceneProps) {
  return (
    <>
      <color attach="background" args={[TOY_SCENE_LIGHTING.background]} />
      {/* World-fixed lights: NOT inside the view-transform group, so pan/rotate never changes the moon direction. */}
      <ambientLight color={TOY_SCENE_LIGHTING.ambient.color} intensity={TOY_SCENE_LIGHTING.ambient.intensity} />
      <directionalLight
        color={TOY_SCENE_LIGHTING.moon.color}
        intensity={TOY_SCENE_LIGHTING.moon.intensity}
        position={TOY_SCENE_LIGHTING.moon.position}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSizePx, shadowMapSizePx]}
      />
      {/* View transform seam: today's legacy pan/rotate. The pan fix (owner decision pending) replaces it with camera movement. */}
      <group
        name={SCENE_OBJECT_NAMES.worldView}
        position={[worldOffset[0], 0, worldOffset[1]]}
        rotation={[0, worldRotation, 0]}
      >
        <RiverEnvironment
          layout={LOY_KRATHONG_RIVER_LAYOUT}
          shadows={shadows}
          waterRef={waterTargetRef}
          onWaterSelected={() => onTargetSelected("water")}
          lampFocusRef={lampTargetRef}
          selectedLampIndex={selectedLampIndex}
          onLampSelected={onLampSelected}
        />
        <group
          ref={krathongTargetRef}
          name={SCENE_OBJECT_NAMES.krathong}
          rotation={[0, objectRotation, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onTargetSelected("krathong");
          }}
        >
          <pointLight
            color={TOY_SCENE_LIGHTING.candle.color}
            intensity={TOY_SCENE_LIGHTING.candle.intensity}
            distance={TOY_SCENE_LIGHTING.candle.distance}
            position={TOY_SCENE_LIGHTING.candle.position}
          />
          <PartChangeBounce changeKey={appearance} reducedMotion={reducedMotion}>
            <KrathongModel appearance={appearance} shadows={shadows} />
          </PartChangeBounce>
        </group>
        <RiverFlow
          items={riverItems}
          lanes={getLoyKrathongRiverLanes()}
          shadows={shadows}
          reducedMotion={reducedMotion}
        />
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
      <ringGeometry args={[ringSize.innerRadius, ringSize.outerRadius, HIGHLIGHT_RING_SEGMENTS]} />
      <meshBasicMaterial color={HIGHLIGHT_RING_COLOR} transparent opacity={HIGHLIGHT_RING_OPACITY} toneMapped={false} />
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
  viewControlRef,
  riverItems = NO_RIVER_ITEMS,
}: {
  mode?: InteractionMode | null;
  onGestureRelease?: () => void;
  viewControlRef?: Ref<CustomizeViewControl>;
  riverItems?: readonly RiverFlowItem[];
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
  const [krathongPosition, setKrathongPosition] = useState<[number, number]>([
    RITUAL_CHIP_START_PERCENT.x,
    RITUAL_CHIP_START_PERCENT.y,
  ]);
  const [lastInteraction, setLastInteraction] = useState<InteractionTarget | null>(null);
  const zoomRef = useRef(1);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const inputSeparatorRef = useRef<{ mode: InteractionMode; input: InputSeparator } | null>(null);
  const waterTargetRef = useRef<Mesh | null>(null);
  const krathongTargetRef = useRef<Group | null>(null);
  const lampTargetRef = useRef<Group | null>(null);
  const [selectedLampIndex, setSelectedLampIndex] = useState(0);
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

  const onLampSelected = useCallback((index: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedLampIndex(index);
    setSelectedTarget("lamp");
    setFlyRequestId((requestId) => requestId + 1);
  }, [mode]);

  const activeTargetRef = selectedTarget === "water"
    ? waterTargetRef
    : selectedTarget === "krathong"
      ? krathongTargetRef
      : selectedTarget === "lamp"
        ? lampTargetRef
        : null;

  const applyZoomFactor = useCallback((factor: number) => {
    zoomRef.current = factor;
    if (cameraRef.current) {
      cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current;
      cameraRef.current.updateProjectionMatrix();
      invalidateRef.current?.();
    }
  }, []);

  const onAction = useCallback((action: InteractionAction) => {
    switch (action.type) {
      case "ROTATE_KRATHONG":
        setObjectRotation((value) => getRotationAfterDrag(value, action.deltaX));
        break;
      case "PINCH_ZOOM":
        applyZoomFactor(getPinchZoomFactor(zoomRef.current, action.scale));
        break;
      case "DRAG_KRATHONG": {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) break;
        setKrathongPosition(([x, y]) => [
          Math.max(RITUAL_CHIP_MIN_PERCENT, Math.min(RITUAL_CHIP_MAX_PERCENT, x + (action.deltaX / rect.width) * PERCENT_SCALE)),
          Math.max(RITUAL_CHIP_MIN_PERCENT, Math.min(RITUAL_CHIP_MAX_PERCENT, y + (action.deltaY / rect.height) * PERCENT_SCALE)),
        ]);
        break;
      }
      case "RELEASE_KRATHONG":
        onGestureRelease?.();
        break;
      case "PAN_RIVER":
        // Legacy pan/rotate kept as is: the gesture model awaits an owner decision (MFW-27 plan §11 Q1).
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
  }, [applyZoomFactor, onGestureRelease]);

  useImperativeHandle(viewControlRef, () => ({
    rotate(direction) {
      if (mode !== "CUSTOMIZE") return;
      setObjectRotation((value) => getRotationAfterStep(value, direction));
    },
    zoom(direction) {
      if (mode !== "CUSTOMIZE") return;
      applyZoomFactor(getZoomFactorAfterStep(zoomRef.current, direction));
    },
  }), [mode, applyZoomFactor]);

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
      className="relative mb-8 h-64 w-full touch-none select-none overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg"
      style={{ backgroundColor: TOY_SCENE_LIGHTING.background }}
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
        key={settings.antialias ? "aa-on" : "aa-off"}
        aria-label="Orthographic toy-like night river scene"
        orthographic={TOY_SCENE_CAMERA.orthographic}
        camera={TOY_SCENE_CANVAS_CAMERA}
        dpr={settings.dpr}
        gl={settings.antialias ? CANVAS_GL_ANTIALIAS_ON : CANVAS_GL_ANTIALIAS_OFF}
        shadows={settings.shadows}
        frameloop="demand"
        onCreated={({ camera, invalidate }) => {
          cameraRef.current = camera instanceof OrthographicCamera ? camera : null;
          invalidateRef.current = invalidate;
          if (cameraRef.current) {
            cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current;
            cameraRef.current.updateProjectionMatrix();
          }
        }}
      >
        <KrathongAssetsProvider>
          <ToyNightScene
            shadows={settings.shadows}
            shadowMapSizePx={settings.shadowMapSizePx}
            appearance={appearance}
            reducedMotion={reducedMotion}
            riverItems={riverItems}
            objectRotation={objectRotation}
            worldRotation={worldRotation}
            worldOffset={worldOffset}
            onTargetSelected={onTargetSelected}
            selectedLampIndex={selectedLampIndex}
            onLampSelected={onLampSelected}
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
