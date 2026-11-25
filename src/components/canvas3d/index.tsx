"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useSpring } from "@react-spring/three";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  memo,
  useRef,
  useState,
  useSyncExternalStore,
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
import type { EffectPoolCaps, QualityTier, RenderTier } from "@/config/performance.config";
import { EFFECT_POOL_CAPS, TIER_ANTIALIAS, TIER_BUDGETS } from "@/config/performance.config";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import type { WorldXZ } from "@/core/coordinates";
import { InspectPopup } from "@/components/ui/InspectPopup";
import { OwnerWishSection } from "@/components/ui/OwnerWishSection";
import { SceneTapHint } from "@/components/ui/SceneTapHint";
import { useSceneTapHint } from "@/components/ui/useSceneTapHint";
import { SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { findInspectedCreation } from "@/components/ui/inspectedCreation";
import { SceneEffects, type SceneEffectsHandle, type SceneGimmickKind } from "./effects/SceneEffects";
import { MOON_SHADOW_MAP_SIZE_PX } from "@/config/scene.config";
import { LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import { createCameraController, updateHighlightPosition } from "@/core/camera";
import type { CameraTargetKind } from "@/core/camera";
import {
  capturesOnPointerDown,
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
  LOY_KRATHONG_RIVER_LAYOUT,
  RiverEnvironment,
} from "@/components/models/loyKrathong";
import { findFocusedRiverItem, getLoyKrathongRiverLanes, NO_PINNED_RIVER_IDS, publicCreationsToRiverItems, type RiverSpot } from "@/core/world";
import { excludeOwnAndCap, isOwnSlotReserved, isOwnZoneVisible, ownKrathongPoseKind, type OwnKrathongPoseKind, type RitualState } from "@/core/ritual";
import { FindMyAnchor } from "./FindMyAnchor";
import { OwnKrathong } from "./OwnKrathong";
import { createRitualDropMapper, getLoyKrathongRitualSite, type PercentPoint, type RitualDropMapper, type RitualSite } from "./ritualSite";
import { PerfProbePanel } from "./PerfProbePanel";
import { readPerfProbeFlag, readPerfProbeFlagOnServer, subscribeToNothing, type RendererInfoSource } from "./perfProbe";
import { RiverFlow, type RiverFlowItem } from "./RiverFlow";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { CANVAS_GL_OPTIONS } from "./sceneLook";
import { SceneLighting } from "./SceneLighting";
import { EnvironmentBlobShadows } from "./BlobShadows";
import { useResolvedLightPreset } from "./useLightPreset";
import { DEFAULT_KRATHONG_APPEARANCE, type KrathongAppearance } from "@/core/customization";
import { useBuilderStore } from "@/store/useBuilderStore";
import { useDeviceStore } from "@/store/useDeviceStore";
import { useUIStore } from "@/store/useUIStore";
import { useWorldStore } from "@/store/useWorldStore";

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

/** No river krathongs (stable empty list). */
export const NO_RIVER_ITEMS: readonly RiverFlowItem[] = Object.freeze([]);

type TargetRef = RefObject<Object3D | null>;

interface ToyNightSceneProps {
  lightPreset: LightPresetId;
  shadows: boolean;
  shadowMapSizePx: number;
  appearance: KrathongAppearance;
  reducedMotion: boolean;
  riverItems: readonly RiverFlowItem[];
  pinnedRiverIds: readonly string[];
  objectRotation: number;
  worldRotation: number;
  worldOffset: readonly [number, number];
  onTargetSelected: (target: CameraTargetKind) => void;
  selectedLampIndex: number;
  onLampSelected: (lampIndex: number) => void;
  waterTargetRef: RefObject<Mesh | null>;
  krathongTargetRef: RefObject<Group | null>;
  lampTargetRef: RefObject<Group | null>;
  effectCaps: EffectPoolCaps;
  effectsRef: Ref<SceneEffectsHandle>;
  onWaterSelected: (tap: WorldXZ | null) => void;
  onRiverItemTapped?: (id: string) => void;
  poseKind: OwnKrathongPoseKind;
  ritual: RitualState;
  site: RitualSite;
  dragPointRef: RefObject<WorldXZ | null>;
  releaseDropRef: RefObject<WorldXZ | null>;
  riverNow: () => number;
  onTouchedDown: (attempt: number, at: WorldXZ) => void;
  onSettled: (attempt: number) => void;
  pierFocusRef: RefObject<Group | null>;
  findMyItem: RiverFlowItem | null;
  findMyAnchorRef: RefObject<Group | null>;
}

const ToyNightScene = memo(function ToyNightScene({
  lightPreset,
  shadows,
  shadowMapSizePx,
  appearance,
  reducedMotion,
  riverItems,
  pinnedRiverIds,
  objectRotation,
  worldRotation,
  worldOffset,
  onTargetSelected,
  selectedLampIndex,
  onLampSelected,
  waterTargetRef,
  krathongTargetRef,
  lampTargetRef,
  effectCaps,
  effectsRef,
  onWaterSelected,
  onRiverItemTapped,
  poseKind,
  ritual,
  site,
  dragPointRef,
  releaseDropRef,
  riverNow,
  onTouchedDown,
  onSettled,
  pierFocusRef,
  findMyItem,
  findMyAnchorRef,
}: ToyNightSceneProps) {
  const onKrathongSelected = useCallback(() => onTargetSelected("krathong"), [onTargetSelected]);
  return (
    <>
      {/* World-fixed lights: NOT inside the view-transform group, so pan/rotate never changes the key-light direction. */}
      <SceneLighting preset={lightPreset} shadows={shadows} shadowMapSizePx={shadowMapSizePx} />
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
          onWaterSelected={onWaterSelected}
          lampFocusRef={lampTargetRef}
          selectedLampIndex={selectedLampIndex}
          onLampSelected={onLampSelected}
        />
        <EnvironmentBlobShadows layout={LOY_KRATHONG_RIVER_LAYOUT} />
        <group ref={pierFocusRef} name={SCENE_OBJECT_NAMES.pierFocus} position={[site.tip.x, site.tip.y, site.tip.z]} />
        <OwnKrathong
          targetRef={krathongTargetRef}
          appearance={appearance}
          shadows={shadows}
          reducedMotion={reducedMotion}
          objectRotation={objectRotation}
          onSelected={onKrathongSelected}
          poseKind={poseKind}
          ritual={ritual}
          site={site}
          lanes={getLoyKrathongRiverLanes()}
          dragPointRef={dragPointRef}
          releaseDropRef={releaseDropRef}
          now={riverNow}
          onTouchedDown={onTouchedDown}
          onSettled={onSettled}
          candleIntensityScale={LIGHT_PRESETS[lightPreset].candle.intensityScale}
        />
        <RiverFlow
          items={riverItems}
          lanes={getLoyKrathongRiverLanes()}
          shadows={shadows}
          reducedMotion={reducedMotion}
          now={riverNow}
          pinnedIds={pinnedRiverIds}
          onItemTapped={onRiverItemTapped}
          shadowSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
        />
        {findMyItem && (
          <FindMyAnchor item={findMyItem} lanes={getLoyKrathongRiverLanes()} now={riverNow} anchorRef={findMyAnchorRef} />
        )}
        <SceneEffects
          handleRef={effectsRef}
          caps={effectCaps}
          reducedMotion={reducedMotion}
          waterSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
          lamps={LOY_KRATHONG_RIVER_LAYOUT.lamps}
          lampHead={RIVER_ENVIRONMENT_PARTS.lampHead}
        />
      </group>
    </>
  );
});

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
  onReleaseDrop,
  viewControlRef,
  riverItems,
}: {
  mode?: InteractionMode | null;
  /** RITUAL_RELEASE: the chip was dropped on the water; the candidate is a parametric lane spot (invariant A). */
  onReleaseDrop?: (candidate: RiverSpot) => void;
  viewControlRef?: Ref<CustomizeViewControl>;
  riverItems?: readonly RiverFlowItem[];
}) {
  const profiled = useDeviceStore((state) => state.profiled);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const reducedMotion = useDeviceStore((state) => state.reducedMotion);
  const lightPreset = useResolvedLightPreset();
  const builderAppearance = useBuilderStore((state) => state.appearance);
  const appearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE;
  const worldEventId = useWorldStore((s) => s.eventId);
  const worldZoneId = useWorldStore((s) => s.currentZoneId);
  const worldZoneItems = useWorldStore((s) => s.zoneItems);
  const focusedCreationId = useWorldStore((s) => s.focusedCreationId);
  const storeRiverItems = useMemo(
    () =>
      (mode === "WORLD_EXPLORE" || mode === "RITUAL_RELEASE") && worldEventId !== null && worldZoneId !== null
        ? publicCreationsToRiverItems(worldZoneItems, { eventId: worldEventId, zoneId: worldZoneId })
        : NO_RIVER_ITEMS,
    [mode, worldEventId, worldZoneId, worldZoneItems],
  );
  const perfProbeEnabled = useSyncExternalStore(subscribeToNothing, readPerfProbeFlag, readPerfProbeFlagOnServer);
  const rendererRef = useRef<RendererInfoSource | null>(null);
  const [soakRiverItems, setSoakRiverItems] = useState<readonly RiverFlowItem[] | null>(null);
  // The soak (perf probe) overrides the river only while it runs, and only in WORLD_EXPLORE.
  const visibleRiverItems = (mode === "WORLD_EXPLORE" ? soakRiverItems : null) ?? riverItems ?? storeRiverItems;
  const ritual = useUIStore((s) => s.ritual);
  const site = getLoyKrathongRitualSite();
  const mapperRef = useRef<RitualDropMapper | null>(null);
  const getMapper = useCallback(() => (mapperRef.current ??= createRitualDropMapper(site)), [site]);
  const chipPercentRef = useRef<PercentPoint>({ x: RITUAL_CHIP_START_PERCENT.x, y: RITUAL_CHIP_START_PERCENT.y });
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const dragPointRef = useRef<WorldXZ | null>(null);
  const releaseDropRef = useRef<WorldXZ | null>(null);
  const pierFocusRef = useRef<Group | null>(null);
  const [framedPier, setFramedPier] = useState(false);
  if (mode === "RITUAL_RELEASE" && !framedPier) setFramedPier(true); // same render-phase pattern as selectionMode
  const offsetMs = ritual.saved?.serverClockOffsetMs ?? 0;
  const riverNow = useMemo(() => () => Date.now() + offsetMs, [offsetMs]);
  const ownZoneVisible = isOwnZoneVisible(ritual.saved?.zoneId ?? null, worldZoneId);
  const poseKind = ownKrathongPoseKind({
    mode,
    phase: ritual.phase,
    hasSaved: ritual.saved !== null,
    dragging,
    ownZoneVisible,
  });
  // The shared list reserves a slot whenever the own krathong is drawn in it (invariant E: items + own ≤ cap).
  const ownShown = isOwnSlotReserved(poseKind);
  const sceneRiverItems = useMemo(
    () => excludeOwnAndCap(visibleRiverItems, ritual.saved?.id ?? null, ownShown),
    [visibleRiverItems, ritual.saved, ownShown],
  );
  const focusRequestId = useWorldStore((s) => s.focusRequestId);
  const findMyItem = useMemo(
    () => (mode === "WORLD_EXPLORE" ? findFocusedRiverItem(visibleRiverItems, focusedCreationId) : null),
    [mode, visibleRiverItems, focusedCreationId],
  );
  const findMyAnchorRef = useRef<Group | null>(null);
  const [seenFocusRequestId, setSeenFocusRequestId] = useState(0);
  const pinnedRiverIds = useMemo(
    () => (focusedCreationId === null ? NO_PINNED_RIVER_IDS : Object.freeze([focusedCreationId])),
    [focusedCreationId],
  );
  const viewportRef = useRef<HTMLElement>(null);
  const [objectRotation, setObjectRotation] = useState(0);
  const [worldRotation, setWorldRotation] = useState(0);
  const [worldOffset, setWorldOffset] = useState<[number, number]>([0, 0]);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const writeChipPosition = useCallback((x: number, y: number) => {
    const el = chipRef.current;
    if (!el) return;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
  }, []);
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
  const effectsRef = useRef<SceneEffectsHandle | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [gimmick, setGimmick] = useState<{ kind: SceneGimmickKind | null; count: number }>({ kind: null, count: 0 });
  const recordGimmick = useCallback((kind: SceneGimmickKind) => setGimmick((g) => ({ kind, count: g.count + 1 })), []);
  if (selectionMode !== mode) {
    setSelectionMode(mode);
    setSelectedTarget(null);
    setInspectedId(null);
  }
  if (seenFocusRequestId !== focusRequestId) {
    setSeenFocusRequestId(focusRequestId);
    if (findMyItem !== null) {
      setSelectedTarget("riverKrathong");
      setFlyRequestId((requestId) => requestId + 1);
    }
  }
  if (selectedTarget === "riverKrathong" && findMyItem === null) setSelectedTarget(null); // zone switch / leave cleared the focus
  const onTargetSelected = useCallback((target: CameraTargetKind) => {
    // Only WORLD_EXPLORE has "แตะสั้นเพื่อ Interact"; RITUAL_RELEASE locks the camera and CUSTOMIZE only rotates/zooms.
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedTarget(target);
    setFlyRequestId((requestId) => requestId + 1);
  }, [mode]);

  const onWaterSelected = useCallback((tap: WorldXZ | null) => {
    if (mode !== "WORLD_EXPLORE") return;
    onTargetSelected("water");
    if (tap && effectsRef.current) {
      effectsRef.current.spawnRipple(tap);
      recordGimmick("ripple");
    }
  }, [mode, onTargetSelected, recordGimmick]);

  const onLampSelected = useCallback((index: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedLampIndex(index);
    setSelectedTarget("lamp");
    setFlyRequestId((requestId) => requestId + 1);
    if (effectsRef.current) {
      effectsRef.current.lightLamp(index);
      recordGimmick("lamp-glow");
    }
  }, [mode, recordGimmick]);

  const onRiverItemTapped = useCallback((id: string) => {
    if (mode !== "WORLD_EXPLORE") return;
    setInspectedId(id);
    recordGimmick("inspect");
  }, [mode, recordGimmick]);

  const onTouchedDown = useCallback((attempt: number, at: WorldXZ) => {
    effectsRef.current?.spawnRipple(at); // MFW-28 pool (invariant E)
    recordGimmick("ripple");
    useUIStore.getState().dispatchRitual({ type: "TOUCHED_DOWN", attempt });
  }, [recordGimmick]);
  const onSettled = useCallback((attempt: number) => {
    useUIStore.getState().dispatchRitual({ type: "SETTLED", attempt });
  }, []);

  const resetChip = useCallback(() => {
    chipPercentRef.current = { x: RITUAL_CHIP_START_PERCENT.x, y: RITUAL_CHIP_START_PERCENT.y };
    writeChipPosition(RITUAL_CHIP_START_PERCENT.x, RITUAL_CHIP_START_PERCENT.y);
    dragPointRef.current = null;
  }, [writeChipPosition]);

  const inspected = useMemo(
    () => (mode === "WORLD_EXPLORE" && inspectedId !== null ? findInspectedCreation(sceneRiverItems, inspectedId) : null),
    [mode, inspectedId, sceneRiverItems],
  );

  const activeTargetRef: TargetRef | null = selectedTarget === "water"
    ? waterTargetRef
    : selectedTarget === "krathong"
      ? krathongTargetRef
      : selectedTarget === "lamp"
        ? lampTargetRef
        : selectedTarget === "riverKrathong"
          ? findMyAnchorRef
          : null;
  const cameraTargetRef: TargetRef | null =
    activeTargetRef ?? (framedPier && (mode === "RITUAL_RELEASE" || mode === "WORLD_EXPLORE") ? pierFocusRef : null);

  const applyZoomFactor = useCallback((factor: number) => {
    zoomRef.current = factor;
    if (cameraRef.current) {
      cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current;
      cameraRef.current.updateProjectionMatrix();
      invalidateRef.current?.();
    }
  }, []);

  const tapHint = useSceneTapHint(mode === "WORLD_EXPLORE");
  const dismissTapHint = tapHint.dismiss;

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
        const { x, y } = chipPercentRef.current;
        const next: PercentPoint = {
          x: Math.max(RITUAL_CHIP_MIN_PERCENT, Math.min(RITUAL_CHIP_MAX_PERCENT, x + (action.deltaX / rect.width) * PERCENT_SCALE)),
          y: Math.max(RITUAL_CHIP_MIN_PERCENT, Math.min(RITUAL_CHIP_MAX_PERCENT, y + (action.deltaY / rect.height) * PERCENT_SCALE)),
        };
        chipPercentRef.current = next;
        writeChipPosition(next.x, next.y); // direct DOM write: no React re-render per pointer-move
        draggingRef.current = true;
        setDragging(true);
        dragPointRef.current = getMapper().toDeckPlane(next, rect, zoomRef.current);
        invalidateRef.current?.();
        break;
      }
      case "RELEASE_KRATHONG": {
        draggingRef.current = false;
        setDragging(false);
        const rect = viewportRef.current?.getBoundingClientRect();
        const drop = rect ? getMapper().mapDrop(chipPercentRef.current, rect, zoomRef.current) : null;
        resetChip();
        if (drop === null || !drop.onWater) {
          useUIStore.getState().dispatchRitual({ type: "DROP_REJECTED" });
        } else {
          releaseDropRef.current = drop.point;
          onReleaseDrop?.(drop.candidate);
        }
        break;
      }
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
        dismissTapHint();
        break;
    }
  }, [applyZoomFactor, onReleaseDrop, getMapper, resetChip, writeChipPosition, dismissTapHint]);

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
    if (capturesOnPointerDown(mode)) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (inputSeparatorRef.current?.mode === mode) {
      const { input } = inputSeparatorRef.current;
      input.pointerMove(pointSample(event, readTarget(event.target)));
      if (mode === "WORLD_EXPLORE" && input.isDragging(event.pointerId) && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId); // pan keeps tracking outside the viewport
        } catch {
          // the pointer is no longer active (e.g. released between events): nothing to capture
        }
      }
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
    if (mode === "RITUAL_RELEASE" && draggingRef.current) {
      // A drag that ended without a release (e.g. outside the viewport): the krathong returns to the pier.
      draggingRef.current = false;
      setDragging(false);
      resetChip();
      useUIStore.getState().dispatchRitual({ type: "DROP_REJECTED" });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLElement>) {
    if (inputSeparatorRef.current?.mode === mode) {
      inputSeparatorRef.current.input.pointerCancel(event.pointerId);
    }
    if (mode === "RITUAL_RELEASE" && draggingRef.current) {
      draggingRef.current = false;
      setDragging(false);
      resetChip();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!profiled || qualityTier === "FALLBACK_2D") return null;

  const settings = getSceneRenderSettings(qualityTier as Exclude<QualityTier, "FALLBACK_2D">);
  const effectCaps = EFFECT_POOL_CAPS[qualityTier as RenderTier];

  return (
    <>
    <section
      aria-label="Toy-like night river preview"
      className="relative mb-8 h-64 w-full touch-none select-none overflow-hidden rounded-3xl border border-indigo-950/30 shadow-lg"
      style={{ backgroundColor: LIGHT_PRESETS[lightPreset].background }}
      data-light-preset={lightPreset}
      data-quality-tier={qualityTier}
      data-selected-target={selectedTarget ?? undefined}
      data-find-my={selectedTarget === "riverKrathong" ? "following" : undefined}
      data-interaction-mode={mode ?? undefined}
      data-zone-id={mode === "WORLD_EXPLORE" ? worldZoneId ?? undefined : undefined}
      data-river-item-count={visibleRiverItems.length}
      data-own-krathong-pose={mode ? poseKind : undefined}
      data-camera-locked={mode ? String(isCameraLocked(mode)) : undefined}
      data-last-interaction={lastInteraction ?? undefined}
      data-input-target={mode === "WORLD_EXPLORE" ? "water" : undefined}
      data-last-gimmick={gimmick.kind ?? undefined}
      data-gimmick-count={gimmick.count}
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
        gl={settings.antialias ? CANVAS_GL_OPTIONS.on : CANVAS_GL_OPTIONS.off}
        shadows={settings.shadows}
        frameloop="demand"
        onCreated={({ camera, invalidate, gl }) => {
          cameraRef.current = camera instanceof OrthographicCamera ? camera : null;
          invalidateRef.current = invalidate;
          if (cameraRef.current) {
            cameraRef.current.zoom = SCENE_CAMERA_ZOOM * zoomRef.current;
            cameraRef.current.updateProjectionMatrix();
          }
          rendererRef.current = gl;
        }}
      >
        <KrathongAssetsProvider>
          <ToyNightScene
            lightPreset={lightPreset}
            shadows={settings.shadows}
            shadowMapSizePx={settings.shadowMapSizePx}
            appearance={appearance}
            reducedMotion={reducedMotion}
            riverItems={sceneRiverItems}
            pinnedRiverIds={pinnedRiverIds}
            objectRotation={objectRotation}
            worldRotation={worldRotation}
            worldOffset={worldOffset}
            onTargetSelected={onTargetSelected}
            selectedLampIndex={selectedLampIndex}
            onLampSelected={onLampSelected}
            waterTargetRef={waterTargetRef}
            krathongTargetRef={krathongTargetRef}
            lampTargetRef={lampTargetRef}
            effectCaps={effectCaps}
            effectsRef={effectsRef}
            onWaterSelected={onWaterSelected}
            onRiverItemTapped={mode === "WORLD_EXPLORE" ? onRiverItemTapped : undefined}
            poseKind={poseKind}
            ritual={ritual}
            site={site}
            dragPointRef={dragPointRef}
            releaseDropRef={releaseDropRef}
            riverNow={riverNow}
            onTouchedDown={onTouchedDown}
            onSettled={onSettled}
            pierFocusRef={pierFocusRef}
            findMyItem={findMyItem}
            findMyAnchorRef={findMyAnchorRef}
          />
          {cameraTargetRef && (
            <CameraFlightController
              targetRef={cameraTargetRef}
              requestId={flyRequestId}
              reducedMotion={reducedMotion}
            />
          )}
          {activeTargetRef && selectedTarget && <TargetHighlight targetRef={activeTargetRef} target={selectedTarget} />}
        </KrathongAssetsProvider>
      </Canvas>
      {mode === "RITUAL_RELEASE" && ritual.phase === "IDLE" && (
        <div
          role="img"
          aria-label="กระทง ลากลงน้ำ"
          className="absolute z-10 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab place-items-center rounded-full border-2 border-amber-200 bg-transparent text-xs font-semibold text-amber-950 shadow-lg active:cursor-grabbing"
          data-input-target="krathong"
          ref={chipRef}
          style={{ left: `${RITUAL_CHIP_START_PERCENT.x}%`, top: `${RITUAL_CHIP_START_PERCENT.y}%` }}
        >
          <span className="sr-only">กระทง</span>
        </div>
      )}
      {tapHint.visible && <SceneTapHint text={SCENE_TAP_HINT_COPY.scene3d} reducedMotion={reducedMotion} />}
      <span className="sr-only" aria-live="polite">
        {lastInteraction ? `Selected ${lastInteraction}` : ""}
      </span>
    </section>
    {perfProbeEnabled && (
      <PerfProbePanel
        rendererRef={rendererRef}
        riverItemCount={visibleRiverItems.length}
        qualityTier={qualityTier}
        soakEnabled={mode === "WORLD_EXPLORE"}
        onSoakItems={setSoakRiverItems}
      />
    )}
    {inspected && (
      <InspectPopup
        key={inspected.id}
        creation={inspected}
        onClose={() => setInspectedId(null)}
        ownerSection={<OwnerWishSection creation={inspected} />}
      />
    )}
    </>
  );
}
