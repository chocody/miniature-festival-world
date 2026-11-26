"use client";

import { Canvas } from "@react-three/fiber";
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
import { OrthographicCamera } from "three";
import type { Group, Mesh } from "three";
import {
  CAMERA_FLIGHT_OFFSET,
  SCENE_CAMERA_FAR,
  SCENE_CAMERA_NEAR,
  SCENE_CAMERA_ZOOM,
} from "@/config/camera.config";
import type { EffectPoolCaps, QualityTier, RenderTier } from "@/config/performance.config";
import { EFFECT_POOL_CAPS, TIER_ANTIALIAS, TIER_BUDGETS } from "@/config/performance.config";
import { getCanvasDprRange } from "@/core/performance/renderPixelRatio";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import type { WorldXZ } from "@/core/coordinates";
import { InspectPopup } from "@/components/ui/InspectPopup";
import { OverlaySlot } from "@/components/ui/StageLayout";
import { OwnerWishSection } from "@/components/ui/OwnerWishSection";
import { SceneTapHint } from "@/components/ui/SceneTapHint";
import { WorldRotateButton } from "@/components/ui/WorldRotateButton";
import { useSceneTapHint } from "@/components/ui/useSceneTapHint";
import { SCENE_TAP_HINT_COPY } from "@/config/gimmicks.config";
import { findInspectedCreation } from "@/components/ui/inspectedCreation";
import { SceneEffects, type SceneEffectsHandle, type SceneGimmickKind } from "./effects/SceneEffects";
import { MOON_SHADOW_MAP_SIZE_PX } from "@/config/scene.config";
import { LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import {
  applyCameraRigPose,
  applyPanDrag,
  createCameraRigState,
  endPan,
  getFramedCameraZoom,
  getRiverPanBounds,
  twistCameraRig,
  type CameraRigState,
  type CameraTargetKind,
} from "@/core/camera";
import {
  capturesOnPointerDown,
  createInputSeparator,
  getPinchZoomFactor,
  getRotationAfterDrag,
  getWheelZoomScale,
  getRotationAfterStep,
  getZoomFactorAfterStep,
  isCameraLocked,
  type CustomizeViewControl,
  type InputSeparator,
  type InteractionAction,
  type InteractionMode,
  type InteractionTarget,
  type PointerSample,
} from "@/core/interaction";
import {
  PERCENT_SCALE,
  RITUAL_CHIP_MAX_PERCENT,
  RITUAL_CHIP_MIN_PERCENT,
  RITUAL_CHIP_START_PERCENT,
  WORLD_VIEW_ROTATE_STEP_RADIANS,
} from "@/config/interaction.config";
import {
  FlameFlicker,
  KrathongAssetsProvider,
  LOY_KRATHONG_RIVER_LAYOUT,
  RiverEnvironment,
} from "@/components/models/loyKrathong";
import { findFocusedRiverItem, getLoyKrathongRiverLanes, NO_PINNED_RIVER_IDS, publicCreationsToRiverItems, type RiverSpot } from "@/core/world";
import { excludeOwnAndCap, isOwnSlotReserved, isOwnZoneVisible, ownKrathongPoseKind, type OwnKrathongPoseKind, type RitualState } from "@/core/ritual";
import { CameraRig, type CameraRigHandle, type WorldPositionSource } from "./CameraRig";
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
import { ShoreHighlights, WaterGlints } from "./WaterHighlights";
import { getSceneMarks } from "./sceneMarks";
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

type TargetRef = RefObject<WorldPositionSource | null>;

/** MFW-57 soft pan bounds of the camera focus, derived from the river channel config (a wider channel widens them). */
const WORLD_PAN_BOUNDS = getRiverPanBounds(LOY_KRATHONG_RIVER_ENVIRONMENT.channel);

interface ToyNightSceneProps {
  lightPreset: LightPresetId;
  shadows: boolean;
  shadowMapSizePx: number;
  appearance: KrathongAppearance;
  reducedMotion: boolean;
  riverItems: readonly RiverFlowItem[];
  pinnedRiverIds: readonly string[];
  objectRotation: number;
  onTargetSelected: (target: Exclude<CameraTargetKind, "water">) => void;
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
  markedRiverId: string | null;
  ownMarked: boolean;
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
  markedRiverId,
  ownMarked,
}: ToyNightSceneProps) {
  const onKrathongSelected = useCallback(() => onTargetSelected("krathong"), [onTargetSelected]);
  return (
    <>
      {/* World-fixed lights: NOT inside the world container, so pan/rotate never changes the key-light direction. */}
      <SceneLighting preset={lightPreset} shadows={shadows} shadowMapSizePx={shadowMapSizePx} />
      <FlameFlicker baseEmissiveIntensity={LIGHT_PRESETS[lightPreset].flame.emissiveIntensity} reducedMotion={reducedMotion} />
      {/* World container (identity). The camera moves (MFW-57); lights stay outside, world-fixed. */}
      <group name={SCENE_OBJECT_NAMES.worldView}>
        <RiverEnvironment
          layout={LOY_KRATHONG_RIVER_LAYOUT}
          shadows={shadows}
          waterRef={waterTargetRef}
          onWaterSelected={onWaterSelected}
          lampFocusRef={lampTargetRef}
          selectedLampIndex={selectedLampIndex}
          onLampSelected={onLampSelected}
          lightPreset={lightPreset}
        />
        <EnvironmentBlobShadows layout={LOY_KRATHONG_RIVER_LAYOUT} />
        <ShoreHighlights layout={LOY_KRATHONG_RIVER_LAYOUT} />
        <WaterGlints layout={LOY_KRATHONG_RIVER_LAYOUT} now={riverNow} />
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
          marked={ownMarked}
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
          markedId={markedRiverId}
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

/** Fills a reused sample (pointer moves: no allocation per event, AC5). The separator never retains it. */
function fillPointSample(event: PointerEvent<HTMLElement>, target: InteractionTarget | null, out: PointerSample): PointerSample {
  out.pointerId = event.pointerId;
  out.x = event.clientX;
  out.y = event.clientY;
  out.time = event.timeStamp;
  out.target = target;
  return out;
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
  // MFW-57 camera rig (render-only, never persisted): lazily created, same lint-safe pattern as getMapper.
  const rigRef = useRef<CameraRigState | null>(null);
  const getRig = useCallback(() => (rigRef.current ??= createCameraRigState()), []);
  const rigHandleRef = useRef<CameraRigHandle | null>(null);
  const moveSampleRef = useRef<PointerSample | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const writeChipPosition = useCallback((x: number, y: number) => {
    const el = chipRef.current;
    if (!el) return;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
  }, []);
  const [lastInteraction, setLastInteraction] = useState<InteractionTarget | null>(null);
  const zoomRef = useRef(1);
  /** Framed zoom of the measured viewport (MFW-54); the pinch factor in zoomRef multiplies it. */
  const baseZoomRef = useRef(SCENE_CAMERA_ZOOM);
  const cameraRef = useRef<OrthographicCamera | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const inputSeparatorRef = useRef<{ mode: InteractionMode; input: InputSeparator } | null>(null);
  const waterTargetRef = useRef<Mesh | null>(null);
  const krathongTargetRef = useRef<Group | null>(null);
  const lampTargetRef = useRef<Group | null>(null);
  const [selectedLampIndex, setSelectedLampIndex] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState<CameraTargetKind | null>(null);
  /**
   * The camera's fly-to target. It changes only with a fly request (or a reset), never on a water tap, so the CameraRig flight
   * effect (keyed on the target ref identity and flyRequestId) cannot re-fire from a selection alone (MFW-69 lead decision).
   */
  const [flightTarget, setFlightTarget] = useState<Exclude<CameraTargetKind, "water"> | null>(null);
  const [flyRequestId, setFlyRequestId] = useState(0);
  const [selectionMode, setSelectionMode] = useState(mode);
  const effectsRef = useRef<SceneEffectsHandle | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [gimmick, setGimmick] = useState<{ kind: SceneGimmickKind | null; count: number }>({ kind: null, count: 0 });
  const recordGimmick = useCallback((kind: SceneGimmickKind) => setGimmick((g) => ({ kind, count: g.count + 1 })), []);
  if (selectionMode !== mode) {
    setSelectionMode(mode);
    setSelectedTarget(null);
    setFlightTarget(null);
    setInspectedId(null);
  }
  if (seenFocusRequestId !== focusRequestId) {
    setSeenFocusRequestId(focusRequestId);
    if (findMyItem !== null) {
      setSelectedTarget("riverKrathong");
      setFlightTarget("riverKrathong");
      setFlyRequestId((requestId) => requestId + 1);
    }
  }
  if (selectedTarget === "riverKrathong" && findMyItem === null) setSelectedTarget(null); // zone switch / leave cleared the focus
  if (flightTarget === "riverKrathong" && findMyItem === null) setFlightTarget(null);
  const onTargetSelected = useCallback((target: Exclude<CameraTargetKind, "water">) => {
    // Only WORLD_EXPLORE has "แตะสั้นเพื่อ Interact"; RITUAL_RELEASE locks the camera and CUSTOMIZE only rotates/zooms.
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedTarget(target);
    setFlightTarget(target);
    setFlyRequestId((requestId) => requestId + 1);
  }, [mode]);

  const onWaterSelected = useCallback((tap: WorldXZ | null) => {
    if (mode !== "WORLD_EXPLORE") return;
    // Decided (lead default, MFW-69; owner may revisit): a water tap selects the water and makes its ripple, but
    // never moves the camera. A flight on every water tap moved the scene under repeated taps at one screen point.
    setSelectedTarget("water");
    if (tap && effectsRef.current) {
      effectsRef.current.spawnRipple(tap);
      recordGimmick("ripple");
    }
  }, [mode, recordGimmick]);

  const onLampSelected = useCallback((index: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedLampIndex(index);
    setSelectedTarget("lamp");
    setFlightTarget("lamp");
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

  const flightTargetRef: TargetRef | null = flightTarget === "krathong"
    ? krathongTargetRef
    : flightTarget === "lamp"
      ? lampTargetRef
      : flightTarget === "riverKrathong"
        ? findMyAnchorRef
        : null;
  const { markedRiverId, ownMarked } = getSceneMarks({
    selectedTarget,
    findMyId: findMyItem?.id ?? null,
    ownId: ritual.saved?.id ?? null,
    ownShown,
  });
  const cameraTargetRef: TargetRef | null =
    flightTargetRef ?? (framedPier && (mode === "RITUAL_RELEASE" || mode === "WORLD_EXPLORE") ? pierFocusRef : null);

  const applyCameraZoom = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.zoom = baseZoomRef.current * zoomRef.current;
    camera.updateProjectionMatrix();
    invalidateRef.current?.();
  }, []);

  const applyRigPose = useCallback(() => {
    const camera = cameraRef.current;
    if (camera) applyCameraRigPose(getRig(), camera);
    invalidateRef.current?.();
  }, [getRig]);

  const onRotateView = useCallback(() => rigHandleRef.current?.rotateBy(WORLD_VIEW_ROTATE_STEP_RADIANS), []);

  const tapHint = useSceneTapHint(mode === "WORLD_EXPLORE");
  const dismissTapHint = tapHint.dismiss;

  const applyZoomFactor = useCallback(
    (factor: number) => {
      zoomRef.current = factor;
      applyCameraZoom();
    },
    [applyCameraZoom],
  );

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
        // MFW-57: the camera travels; the world under the finger follows the finger (no React state per move).
        applyPanDrag(getRig(), action.deltaX, action.deltaY, baseZoomRef.current * zoomRef.current, action.time, WORLD_PAN_BOUNDS);
        applyRigPose();
        break;
      case "PAN_END":
        // Read the store now: the separator keeps the first onAction it was created with.
        endPan(getRig(), action.time, WORLD_PAN_BOUNDS, useDeviceStore.getState().reducedMotion);
        applyRigPose();
        break;
      case "ROTATE_VIEW":
        twistCameraRig(getRig(), action.deltaRad);
        applyRigPose();
        break;
      case "TAP_INTERACT":
        setLastInteraction(action.target);
        dismissTapHint();
        break;
    }
  }, [applyZoomFactor, onReleaseDrop, getMapper, resetChip, writeChipPosition, dismissTapHint, getRig, applyRigPose]);

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
      const sample = (moveSampleRef.current ??= { pointerId: 0, x: 0, y: 0, time: 0, target: null });
      input.pointerMove(fillPointSample(event, readTarget(event.target), sample));
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

  const sceneShown = profiled && qualityTier !== "FALLBACK_2D";

  // MFW-54: the base zoom frames the scene at any viewport size; applied imperatively, never through React state.
  useEffect(() => {
    const el = viewportRef.current;
    if (!sceneShown || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box) return;
      const next = getFramedCameraZoom({ width: box.width, height: box.height });
      el.dataset.cameraZoom = String(next); // direct DOM write: no React re-render per resize (e2e hook)
      if (next === baseZoomRef.current) return;
      baseZoomRef.current = next;
      applyCameraZoom();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [sceneShown, applyCameraZoom]);

  // MFW-57: wheel / trackpad pinch zooms in WORLD_EXPLORE. Native and non-passive: React's onWheel cannot preventDefault().
  useEffect(() => {
    const el = viewportRef.current;
    if (!sceneShown || mode !== "WORLD_EXPLORE" || !el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = getWheelZoomScale(event.deltaY, event.deltaMode, el.clientHeight);
      if (scale !== 1) applyZoomFactor(getPinchZoomFactor(zoomRef.current, scale));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sceneShown, mode, applyZoomFactor]);

  // MFW-54: the full-screen canvas stays within the tier's pixel budget; the screen size is stable across resize and rotation.
  const canvasDpr = useMemo(
    () =>
      sceneShown
        ? getCanvasDprRange(qualityTier as RenderTier, typeof screen === "undefined" ? 0 : screen.width * screen.height)
        : null,
    [sceneShown, qualityTier],
  );

  if (!sceneShown) return null;

  const settings = getSceneRenderSettings(qualityTier as Exclude<QualityTier, "FALLBACK_2D">);
  const effectCaps = EFFECT_POOL_CAPS[qualityTier as RenderTier];

  return (
    <>
    <section
      aria-label="Toy-like night river preview"
      className="relative h-full w-full touch-none select-none overflow-hidden"
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
        dpr={canvasDpr ?? settings.dpr}
        gl={settings.antialias ? CANVAS_GL_OPTIONS.on : CANVAS_GL_OPTIONS.off}
        shadows={settings.shadows}
        frameloop="demand"
        onCreated={({ camera, invalidate, gl }) => {
          cameraRef.current = camera instanceof OrthographicCamera ? camera : null;
          invalidateRef.current = invalidate;
          if (cameraRef.current) {
            cameraRef.current.zoom = baseZoomRef.current * zoomRef.current;
            cameraRef.current.updateProjectionMatrix();
            applyCameraRigPose(getRig(), cameraRef.current); // a tier-change Canvas re-creation keeps the travelled pose
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
            markedRiverId={markedRiverId}
            ownMarked={ownMarked}
          />
          <CameraRig
            getRig={getRig}
            bounds={WORLD_PAN_BOUNDS}
            targetRef={cameraTargetRef}
            requestId={flyRequestId}
            reducedMotion={reducedMotion}
            handleRef={rigHandleRef}
          />
        </KrathongAssetsProvider>
      </Canvas>
      {mode === "RITUAL_RELEASE" && ritual.phase === "IDLE" && (
        <div
          role="img"
          aria-label="กระทง ลากลงน้ำ"
          className="absolute z-10 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab place-items-center rounded-full bg-transparent active:cursor-grabbing"
          data-input-target="krathong"
          ref={chipRef}
          style={{ left: `${RITUAL_CHIP_START_PERCENT.x}%`, top: `${RITUAL_CHIP_START_PERCENT.y}%` }}
        >
          <span className="sr-only">กระทง</span>
        </div>
      )}
      {tapHint.visible && (
        <OverlaySlot slot="hint">
          <SceneTapHint text={SCENE_TAP_HINT_COPY.scene3d} reducedMotion={reducedMotion} />
        </OverlaySlot>
      )}
      <span className="sr-only" aria-live="polite">
        {lastInteraction ? `Selected ${lastInteraction}` : ""}
      </span>
    </section>
    {/* Outside the section: its pointerdowns must not reach the gesture separator. */}
    {mode === "WORLD_EXPLORE" && <WorldRotateButton onRotate={onRotateView} />}
    {perfProbeEnabled && (
      <OverlaySlot slot="debug">
        <PerfProbePanel
          rendererRef={rendererRef}
          riverItemCount={visibleRiverItems.length}
          qualityTier={qualityTier}
          soakEnabled={mode === "WORLD_EXPLORE"}
          onSoakItems={setSoakRiverItems}
        />
      </OverlaySlot>
    )}
    {inspected && (
      <OverlaySlot slot="sheet">
        <InspectPopup
          key={inspected.id}
          creation={inspected}
          onClose={() => setInspectedId(null)}
          ownerSection={<OwnerWishSection creation={inspected} />}
        />
      </OverlaySlot>
    )}
    </>
  );
}
