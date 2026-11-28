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
  DEFAULT_VIEW_YAW_RAD,
  SCENE_CAMERA_FAR,
  SCENE_CAMERA_NEAR,
  SCENE_CAMERA_ZOOM,
} from "@/config/camera.config";
import type { EffectPoolCaps, RenderTier } from "@/config/performance.config";
import { EFFECT_POOL_CAPS, FIREWORK_SPARKS_PER_BURST, TIER_ANTIALIAS, TIER_BUDGETS } from "@/config/performance.config";
import { CHIMNEY_SMOKE_PUFFS_PER_TAP, FALLING_LEAVES_PER_TAP } from "@/config/performance.config";
import { getCanvasDprRange } from "@/core/performance/renderPixelRatio";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import type { WorldXZ } from "@/core/coordinates";
import { InspectPopup } from "@/components/ui/InspectPopup";
import { WishBubble } from "@/components/ui/WishBubble";
import { isOwnedCreation } from "@/services/auth/ownedCreationHint";
import { OverlaySlot } from "@/components/ui/StageLayout";
import { OwnerWishSection } from "@/components/ui/OwnerWishSection";
import { SceneTapHint } from "@/components/ui/SceneTapHint";
import { useSceneTapHint } from "@/components/ui/useSceneTapHint";
import { type SceneTargetKind } from "@/config/gimmicks.config";
import { findInspectedCreation, inspectTapOutcome } from "@/components/ui/inspectedCreation";
import { SCENE_EFFECT_CLOCK, SceneEffects, type SceneEffectsHandle, type SceneGimmickKind } from "./effects/SceneEffects";
import { createObjectPoolManager, type NudgeSource } from "@/core/effects";
import { MOON_SHADOW_MAP_SIZE_PX } from "@/config/scene.config";
import { BLOB_SHADOW_TIER_GEOMETRY, LIGHT_PRESETS, type LightPresetId } from "@/config/look.config";
import {
  applyCameraRigPose,
  applyPanDrag,
  endPan,
  getEndlessRiverPanBounds,
  getFramedCameraZoom,
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
import { FlameFlicker, KrathongAssetsProvider, LOY_KRATHONG_RIVER_LAYOUT, useKrathongModelLoadStatus } from "@/components/models/loyKrathong";
import { LOY_KRATHONG_HOUSE_SMOKE_ORIGINS, LOY_KRATHONG_TREE_LEAF_ANCHORS } from "@/components/models/loyKrathong";
import {
  buildRiverStretchSlots,
  findFocusedRiverItem,
  getLoyKrathongEndlessRiverFrame,
  getLoyKrathongRiverLanes,
  getZoneRiverItems,
  NO_PINNED_RIVER_IDS,
  publicCreationsToRiverItems,
  type RiverSpot,
} from "@/core/world";
import { ZONE_STREAM_LOAD_RADIUS } from "@/config/world.config";
import { getZonePagination } from "@/services/api/zonePagination";
import { excludeOwnAndCap, isOwnSlotReserved, isOwnZoneVisible, ownKrathongPoseKind, type OwnKrathongPoseKind, type RitualState } from "@/core/ritual";
import { CameraRig, type CameraRigHandle, type WorldPositionSource } from "./CameraRig";
import { createRigAt, pierFramingPose } from "./landingFraming";
import { OwnKrathong } from "./OwnKrathong";
import { createRitualDropMapper, getLoyKrathongRitualSite, type PercentPoint, type RitualDropMapper, type RitualSite } from "./ritualSite";
import { PerfProbePanel } from "./PerfProbePanel";
import { readPerfProbeFlag, readPerfProbeFlagOnServer, subscribeToNothing, type RendererInfoSource } from "./perfProbe";
import type { RiverFlowItem } from "./RiverFlow";
import { RiverStretch } from "./RiverStretch";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { CANVAS_GL_OPTIONS } from "./sceneLook";
import { SceneLighting } from "./SceneLighting";
import { getSceneMarks } from "./sceneMarks";
import { AmbientTicker } from "./AmbientLife";
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

/** MFW-58: the endless river's stretch frame (period T = last − first centreline control point). Render-time only. */
const ENDLESS = getLoyKrathongEndlessRiverFrame();

/**
 * Soft pan bounds of the camera focus (MFW-57), MFW-58: the endless-river corridor — unbounded along the river, the channel corridor
 * across it. Exported so tests use the same bounds.
 */
export const WORLD_PAN_BOUNDS = getEndlessRiverPanBounds(ENDLESS, LOY_KRATHONG_RIVER_ENVIRONMENT.channel);

/** MFW-58: what one stretch slot shows (render-time only; derived from zone_id + SplinePathCoord and the river config). */
interface StretchSlotView {
  readonly ringIndex: number;
  readonly stretchIndex: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly isCurrent: boolean;
  readonly zoneId: number | null;
  readonly riverItems: readonly RiverFlowItem[];
  readonly findMyItem: RiverFlowItem | null;
  readonly markedRiverId: string | null;
  /** The focused id for the current slot and the Find My slot; NO_PINNED_RIVER_IDS elsewhere (stable: no re-render). */
  readonly pinnedRiverIds: readonly string[];
}

interface ToyNightSceneProps {
  lightPreset: LightPresetId;
  shadows: boolean;
  shadowMapSizePx: number;
  appearance: KrathongAppearance;
  reducedMotion: boolean;
  /** MFW-58: the 3 stretch slots, current first (S, S − 1, S + 1). */
  stretches: readonly StretchSlotView[];
  /** MFW-58: offset s·T of the camera's stretch (the pier focus and the own krathong live there). */
  currentOffsetX: number;
  currentOffsetZ: number;
  getRig: () => CameraRigState;
  objectRotation: number;
  onTargetSelected: (target: Exclude<CameraTargetKind, "water">) => void;
  selectedLampIndex: number;
  /** MFW-58: the stretch of the selected lamp (its slot holds the lamp fly-to target). */
  selectedLampStretch: number;
  onLampSelected: (lampIndex: number, stretchIndex: number) => void;
  waterTargetRef: RefObject<Mesh | null>;
  krathongTargetRef: RefObject<Group | null>;
  lampTargetRef: RefObject<Group | null>;
  effectCaps: EffectPoolCaps;
  effectsRef: Ref<SceneEffectsHandle>;
  onWaterSelected: (tap: WorldXZ | null, stretchIndex: number) => void;
  onRiverItemTapped?: (id: string, stretchIndex: number) => void;
  /** MFW-80: the krathong whose wish bubble follows it, with the stretch copy that was tapped. */
  wishBubble: { readonly item: RiverFlowItem; readonly stretchIndex: number } | null;
  wishBubbleRef: RefObject<HTMLDivElement | null>;
  poseKind: OwnKrathongPoseKind;
  ritual: RitualState;
  site: RitualSite;
  dragPointRef: RefObject<WorldXZ | null>;
  releaseDropRef: RefObject<WorldXZ | null>;
  riverNow: () => number;
  onTouchedDown: (attempt: number, at: WorldXZ) => void;
  onSettled: (attempt: number) => void;
  pierFocusRef: RefObject<Group | null>;
  /** MFW-154: an empty group at the current stretch's origin (the customizer hero framing). */
  customizeFocusRef: RefObject<Group | null>;
  findMyAnchorRef: RefObject<Group | null>;
  ownMarked: boolean;
  /** MFW-50: the living world may keep an idle-redraw cadence (true only in WORLD_EXPLORE). A primitive keeps the memo effective. */
  livingWorldIdleRedraw: boolean;
  /** MFW-60: FIREWORK_SPARKS_PER_BURST[tier]. */
  fireworkSparks: number;
  /** MFW-72: CHIMNEY_SMOKE_PUFFS_PER_TAP[tier] and FALLING_LEAVES_PER_TAP[tier] (primitives keep the memo effective). */
  smokePuffs: number;
  leavesPerFall: number;
  /** MFW-75: BLOB_SHADOW_TIER_GEOMETRY[tier], the fan of the lamp ground light (a frozen per-tier object: stable identity). */
  lampGroundFan: Readonly<{ segments: number; rings: number }>;
  /** MFW-60: a prop / land tap (WORLD_EXPLORE only; absent = no prop proxies and no land / pier handlers). Stable callback. */
  onPropTapped?: (kind: SceneTargetKind, index: number, at: WorldXZ | null, stretchIndex: number) => void;
}

const ToyNightScene = memo(function ToyNightScene({
  lightPreset,
  shadows,
  shadowMapSizePx,
  appearance,
  reducedMotion,
  stretches,
  currentOffsetX,
  currentOffsetZ,
  getRig,
  objectRotation,
  onTargetSelected,
  selectedLampIndex,
  selectedLampStretch,
  onLampSelected,
  waterTargetRef,
  krathongTargetRef,
  lampTargetRef,
  effectCaps,
  effectsRef,
  onWaterSelected,
  onRiverItemTapped,
  wishBubble,
  wishBubbleRef,
  poseKind,
  ritual,
  site,
  dragPointRef,
  releaseDropRef,
  riverNow,
  onTouchedDown,
  onSettled,
  pierFocusRef,
  customizeFocusRef,
  findMyAnchorRef,
  ownMarked,
  livingWorldIdleRedraw,
  fireworkSparks,
  smokePuffs,
  leavesPerFall,
  lampGroundFan,
  onPropTapped,
}: ToyNightSceneProps) {
  const onKrathongSelected = useCallback(() => onTargetSelected("krathong"), [onTargetSelected]);
  // MFW-60: the effect pools live here so every stretch's foliage, rocks, pier and villagers share the nudge pool with SceneEffects.
  // MFW-58: ONE set of pools per canvas whatever the number of stretch slots (invariant E: the caps bound every stretch together).
  const pools = useMemo(() => createObjectPoolManager(effectCaps), [effectCaps]);
  const nudges = useMemo<NudgeSource>(() => ({ pool: pools.nudge, now: SCENE_EFFECT_CLOCK }), [pools]);
  return (
    <>
      {/* World-fixed lights: NOT inside the world container, so pan/rotate never changes the key-light direction. */}
      <SceneLighting preset={lightPreset} shadows={shadows} shadowMapSizePx={shadowMapSizePx} />
      <FlameFlicker baseEmissiveIntensity={LIGHT_PRESETS[lightPreset].flame.emissiveIntensity} reducedMotion={reducedMotion} />
      {/* MFW-50 idle-redraw registration: once per canvas (not per stretch slot). */}
      <AmbientTicker enabled={livingWorldIdleRedraw} />
      {/* World container (identity). The camera moves (MFW-57); lights stay outside, world-fixed. */}
      <group name={SCENE_OBJECT_NAMES.worldView}>
        {stretches.map((slot) => (
          <RiverStretch
            key={slot.ringIndex}
            stretchIndex={slot.stretchIndex}
            offsetX={slot.offsetX}
            offsetZ={slot.offsetZ}
            isCurrent={slot.isCurrent}
            getRig={getRig}
            riverItems={slot.riverItems}
            markedRiverId={slot.markedRiverId}
            findMyItem={slot.findMyItem}
            findMyAnchorRef={findMyAnchorRef}
            lampFocusRef={slot.stretchIndex === selectedLampStretch ? lampTargetRef : null}
            selectedLampIndex={slot.stretchIndex === selectedLampStretch ? selectedLampIndex : 0}
            waterTargetRef={slot.isCurrent ? waterTargetRef : null}
            onWaterSelected={onWaterSelected}
            onLampSelected={onLampSelected}
            onPropTapped={onPropTapped}
            onRiverItemTapped={onRiverItemTapped}
            bubbleItem={wishBubble !== null && wishBubble.stretchIndex === slot.stretchIndex ? wishBubble.item : null}
            wishBubbleRef={wishBubbleRef}
            nudges={nudges}
            lightPreset={lightPreset}
            shadows={shadows}
            reducedMotion={reducedMotion}
            riverNow={riverNow}
            pinnedRiverIds={slot.pinnedRiverIds}
          />
        ))}
        {/* The pier focus and the own krathong belong to the camera's stretch (MFW-58; stretch 0 during the ritual). */}
        <group position={[currentOffsetX, 0, currentOffsetZ]}>
          <group ref={pierFocusRef} name={SCENE_OBJECT_NAMES.pierFocus} position={[site.tip.x, site.tip.y, site.tip.z]} />
          <group ref={customizeFocusRef} name={SCENE_OBJECT_NAMES.customizeFocus} />
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
        </group>
        <SceneEffects
          handleRef={effectsRef}
          pools={pools}
          reducedMotion={reducedMotion}
          waterSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
          lamps={LOY_KRATHONG_RIVER_LAYOUT.lamps}
          lampHead={RIVER_ENVIRONMENT_PARTS.lampHead}
          houseWindows={LOY_KRATHONG_RIVER_LAYOUT.houseWindows}
          windowsPerHouse={LOY_KRATHONG_RIVER_ENVIRONMENT.houseFacade.windows.length}
          windowPart={RIVER_ENVIRONMENT_PARTS.houseWindow}
          fireworkBaseY={LOY_KRATHONG_RIVER_LAYOUT.bankTopY}
          fireworkSparks={fireworkSparks}
          lightPreset={lightPreset}
          houseSmokeOrigins={LOY_KRATHONG_HOUSE_SMOKE_ORIGINS}
          smokePuffs={smokePuffs}
          treeLeafAnchors={LOY_KRATHONG_TREE_LEAF_ANCHORS}
          leavesPerFall={leavesPerFall}
          lampGroundFan={lampGroundFan}
          frame={ENDLESS}
        />
      </group>
    </>
  );
});

/** MFW-58: the first slot (current, behind, ahead) that shows the focused krathong, with that slot's stretch. */
function findFocusInSlots(
  slots: readonly { readonly stretchIndex: number }[],
  current: readonly RiverFlowItem[],
  neighbours: readonly (readonly RiverFlowItem[])[],
  focusedId: string | null,
): { readonly item: RiverFlowItem; readonly stretchIndex: number } | null {
  for (let i = 0; i < slots.length; i++) {
    const item = findFocusedRiverItem(i === 0 ? current : neighbours[i], focusedId);
    if (item !== null) return { item, stretchIndex: slots[i].stretchIndex };
  }
  return null;
}

/** MFW-80: the tapped krathong in the slot that was tapped (the same id may appear in several slots), with that slot's stretch. */
function findBubbleTargetInSlots(
  slots: readonly { readonly stretchIndex: number }[],
  current: readonly RiverFlowItem[],
  neighbours: readonly (readonly RiverFlowItem[])[],
  tapped: { readonly id: string; readonly stretchIndex: number },
): { readonly item: RiverFlowItem; readonly stretchIndex: number } | null {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].stretchIndex !== tapped.stretchIndex) continue;
    const items = i === 0 ? current : neighbours[i];
    for (let j = 0; j < items.length; j++) {
      if (items[j].id === tapped.id) return { item: items[j], stretchIndex: tapped.stretchIndex };
    }
  }
  return null;
}

/** MFW-58: the inspected krathong in the current zone, else in a neighbour slot. */
function findInspectedInSlots(current: readonly RiverFlowItem[], neighbours: readonly (readonly RiverFlowItem[])[], id: string) {
  const found = findInspectedCreation(current, id);
  if (found !== null) return found;
  for (const items of neighbours) {
    const hit = findInspectedCreation(items, id);
    if (hit !== null) return hit;
  }
  return null;
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
  startFramedOnPier = false,
}: {
  mode?: InteractionMode | null;
  /** RITUAL_RELEASE: the chip was dropped on the water; the candidate is a parametric lane spot (invariant A). */
  onReleaseDrop?: (candidate: RiverSpot) => void;
  viewControlRef?: Ref<CustomizeViewControl>;
  riverItems?: readonly RiverFlowItem[];
  /**
   * MFW-154: true when FlowRoot mounts the scene on the landing view; read once, when the rig is created: the rig starts on
   * the pier focus (the post-release framing), so the landing has no flight. false keeps the origin rig (customizer / ritual
   * mounts and the scene unit tests).
   */
  startFramedOnPier?: boolean;
}) {
  const profiled = useDeviceStore((state) => state.profiled);
  const webglAvailable = useDeviceStore((state) => state.webglAvailable);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const reducedMotion = useDeviceStore((state) => state.reducedMotion);
  const lightPreset = useResolvedLightPreset();
  const builderAppearance = useBuilderStore((state) => state.appearance);
  const appearance = builderAppearance ?? DEFAULT_KRATHONG_APPEARANCE;
  const worldEventId = useWorldStore((s) => s.eventId);
  const worldZoneId = useWorldStore((s) => s.currentZoneId);
  const worldZoneItems = useWorldStore((s) => s.zoneItems);
  const focusedCreationId = useWorldStore((s) => s.focusedCreationId);
  // MFW-58 endless river (render-time only, never persisted): the camera's stretch, the zone ↔ stretch anchor and the streamed zones.
  const currentStretch = useWorldStore((s) => s.currentStretchIndex);
  const stretchAnchor = useWorldStore((s) => s.stretchAnchor);
  const worldZoneCount = useWorldStore((s) => s.zoneCount);
  const streamedZoneItems = useWorldStore((s) => s.streamedZoneItems);
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
  const customizeFocusRef = useRef<Group | null>(null);
  const [customizeHandOver, setCustomizeHandOver] = useState(false);
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
  const slots = useMemo(
    () => buildRiverStretchSlots(ENDLESS, currentStretch, stretchAnchor, worldZoneCount),
    [currentStretch, stretchAnchor, worldZoneCount],
  );
  /** Items of the neighbour slots (stable per streamed zone array); the current slot uses sceneRiverItems. */
  const neighbourItems = useMemo(
    () =>
      slots.map((slot) => {
        if (slot.relative === 0 || slot.zoneId === null || worldEventId === null) return NO_RIVER_ITEMS;
        if (mode !== "WORLD_EXPLORE" && mode !== "RITUAL_RELEASE") return NO_RIVER_ITEMS;
        const streamed = streamedZoneItems[slot.zoneId];
        return streamed === undefined ? NO_RIVER_ITEMS : getZoneRiverItems(streamed, { eventId: worldEventId, zoneId: slot.zoneId });
      }),
    [slots, worldEventId, mode, streamedZoneItems],
  );
  /** MFW-30 Find My target: the first slot (current, behind, ahead) that shows the focused krathong. */
  const findMy = useMemo(
    () => (mode === "WORLD_EXPLORE" ? findFocusInSlots(slots, visibleRiverItems, neighbourItems, focusedCreationId) : null),
    [mode, slots, visibleRiverItems, neighbourItems, focusedCreationId],
  );
  const findMyItem = findMy?.item ?? null;
  const findMyAnchorRef = useRef<Group | null>(null);
  const [seenFocusRequestId, setSeenFocusRequestId] = useState(0);
  const pinnedRiverIds = useMemo(
    () => (focusedCreationId === null ? NO_PINNED_RIVER_IDS : Object.freeze([focusedCreationId])),
    [focusedCreationId],
  );
  const viewportRef = useRef<HTMLElement>(null);
  const [objectRotation, setObjectRotation] = useState(0);
  // MFW-57 camera rig (render-only, never persisted): lazily created, same lint-safe pattern as getMapper.
  const [initialRigPose] = useState(() =>
    startFramedOnPier ? pierFramingPose(site.tip, slots[0].offsetX, slots[0].offsetZ) : null,
  );
  const rigRef = useRef<CameraRigState | null>(null);
  const getRig = useCallback(() => (rigRef.current ??= createRigAt(initialRigPose)), [initialRigPose]);
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
  /** MFW-58: the stretch of the selected lamp (the lamp fly-to target lives in that slot). */
  const [selectedLampStretch, setSelectedLampStretch] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState<CameraTargetKind | null>(null);
  /**
   * The camera's fly-to target. It changes only with a fly request (or a reset), never on a water tap, so the CameraRig flight
   * effect (keyed on the target ref identity and flyRequestId) cannot re-fire from a selection alone (MFW-69 lead decision).
   */
  const [flightTarget, setFlightTarget] = useState<Exclude<CameraTargetKind, "water"> | null>(null);
  const [flyRequestId, setFlyRequestId] = useState(0);
  const [selectionMode, setSelectionMode] = useState(mode);
  const effectsRef = useRef<SceneEffectsHandle | null>(null);
  const [tapped, setTapped] = useState<{ id: string; stretchIndex: number; seq: number } | null>(null);
  const [gimmick, setGimmick] = useState<{ kind: SceneGimmickKind | null; count: number }>({ kind: null, count: 0 });
  const recordGimmick = useCallback((kind: SceneGimmickKind) => setGimmick((g) => ({ kind, count: g.count + 1 })), []);
  if (selectionMode !== mode) {
    // MFW-154 camera hand-over: the landing flies to the customizer hero framing and a cancel flies back to the pier.
    if (selectionMode === "WORLD_EXPLORE" && mode === "CUSTOMIZE") setCustomizeHandOver(true);
    if (selectionMode === "CUSTOMIZE" && mode === "WORLD_EXPLORE") setFramedPier(true);
    setSelectionMode(mode);
    setSelectedTarget(null);
    setFlightTarget(null);
    setTapped(null);
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
  // MFW-58: the flight target is NOT reset when the Find My item leaves the stretch window — a camera must never fly on its own.
  const onTargetSelected = useCallback((target: Exclude<CameraTargetKind, "water">) => {
    // Only WORLD_EXPLORE has "แตะสั้นเพื่อ Interact"; RITUAL_RELEASE locks the camera and CUSTOMIZE only rotates/zooms.
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedTarget(target);
    setFlightTarget(target);
    setFlyRequestId((requestId) => requestId + 1);
  }, [mode]);

  // MFW-58: every tap handler gets the tapped stretch; tap points arrive in world-view space (slot-local + s·T).
  const onWaterSelected = useCallback((tap: WorldXZ | null, stretchIndex: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    // Decided (lead default, MFW-69; owner may revisit): a water tap selects the water and makes its ripple, but
    // never moves the camera. A flight on every water tap moved the scene under repeated taps at one screen point.
    setSelectedTarget("water");
    const gimmick = effectsRef.current?.react("water", 0, tap, stretchIndex) ?? null; // registry (MFW-60): a ripple at the tap
    if (gimmick !== null) recordGimmick(gimmick);
  }, [mode, recordGimmick]);

  const onLampSelected = useCallback((index: number, stretchIndex: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    setSelectedLampIndex(index);
    setSelectedLampStretch(stretchIndex);
    setSelectedTarget("lamp");
    setFlightTarget("lamp");
    setFlyRequestId((requestId) => requestId + 1);
    const gimmick = effectsRef.current?.react("lamp", index, null, stretchIndex) ?? null; // registry (MFW-60; MFW-75: light on)
    if (gimmick !== null) recordGimmick(gimmick);
  }, [mode, recordGimmick]);

  /**
   * MFW-60: a tap on a house, tree, bush, reed, rock, the pier, a villager or bare land ("sky"). It neither selects anything nor
   * moves the camera (loop decision, not yet reviewed by the owner); the reaction comes from the SCENE_TAP_REACTIONS registry.
   */
  const onPropTapped = useCallback((kind: SceneTargetKind, index: number, at: WorldXZ | null, stretchIndex: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    const gimmick = effectsRef.current?.react(kind, index, at, stretchIndex) ?? null;
    if (gimmick !== null) recordGimmick(gimmick);
  }, [mode, recordGimmick]);

  const onRiverItemTapped = useCallback((id: string, stretchIndex: number) => {
    if (mode !== "WORLD_EXPLORE") return;
    setTapped((p) => ({ id, stretchIndex, seq: (p?.seq ?? 0) + 1 }));
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

  // MFW-58: a tapped krathong may be in any rendered stretch (the current zone first).
  const tappedId = tapped?.id ?? null;
  const inspected = useMemo(
    () => (mode === "WORLD_EXPLORE" && tappedId !== null ? findInspectedInSlots(sceneRiverItems, neighbourItems, tappedId) : null),
    [mode, tappedId, sceneRiverItems, neighbourItems],
  );
  // MFW-80: your own krathong opens the popup; another person's open wish shows a fading bubble; a closed wish shows nothing.
  const outcome = useMemo(() => (inspected === null ? "none" : inspectTapOutcome(inspected, isOwnedCreation)), [inspected]);
  const wishBubble = useMemo(
    () => (outcome === "bubble" && tapped !== null ? findBubbleTargetInSlots(slots, sceneRiverItems, neighbourItems, tapped) : null),
    [outcome, tapped, slots, sceneRiverItems, neighbourItems],
  );
  const wishBubbleRef = useRef<HTMLDivElement | null>(null);
  const onBubbleDone = useCallback(() => setTapped(null), []);

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
    flightTargetRef ??
    (mode === "CUSTOMIZE"
      ? customizeHandOver
        ? customizeFocusRef
        : null
      : framedPier && (mode === "RITUAL_RELEASE" || mode === "WORLD_EXPLORE")
        ? pierFocusRef
        : null);
  const findMyStretch = findMy?.stretchIndex ?? null;
  const stretches = useMemo<readonly StretchSlotView[]>(
    () =>
      slots.map((slot, i) => {
        const holdsFindMy = findMyStretch === slot.stretchIndex;
        return {
          ringIndex: slot.ringIndex,
          stretchIndex: slot.stretchIndex,
          offsetX: slot.offsetX,
          offsetZ: slot.offsetZ,
          isCurrent: slot.relative === 0,
          zoneId: slot.zoneId,
          riverItems: i === 0 ? sceneRiverItems : neighbourItems[i],
          findMyItem: holdsFindMy ? findMyItem : null,
          markedRiverId: holdsFindMy ? markedRiverId : null,
          pinnedRiverIds: i === 0 || holdsFindMy ? pinnedRiverIds : NO_PINNED_RIVER_IDS,
        };
      }),
    [slots, sceneRiverItems, neighbourItems, findMyStretch, findMyItem, markedRiverId, pinnedRiverIds],
  );
  const onStretchChange = useCallback((stretchIndex: number) => getZonePagination().setCurrentStretch(stretchIndex), []);

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

  // MFW-74: the rotate button lives in the HUD column (FlowRoot); it bumps viewRotateRequestId and the rig turns here.
  const viewRotateRequestId = useUIStore((s) => s.viewRotateRequestId);
  const seenViewRotateIdRef = useRef(viewRotateRequestId); // initialised at mount: a remount never rotates
  useEffect(() => {
    if (seenViewRotateIdRef.current === viewRotateRequestId) return;
    seenViewRotateIdRef.current = viewRotateRequestId;
    if (mode === "WORLD_EXPLORE") rigHandleRef.current?.rotateBy(WORLD_VIEW_ROTATE_STEP_RADIANS);
  }, [viewRotateRequestId, mode]);

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

  const sceneShown = profiled && webglAvailable;

  // MFW-58: the 3D scene streams the zones of ZONE_STREAM_LOAD_RADIUS stretches on each side (0 while no scene is mounted).
  useEffect(() => {
    if (!sceneShown) return;
    const pagination = getZonePagination();
    pagination.setStreamRadius(ZONE_STREAM_LOAD_RADIUS);
    return () => pagination.setStreamRadius(0);
  }, [sceneShown]);

  // MFW-58: in the shared world the navigator's ‹ › fly the camera one stretch along the river (reduced motion: an instant cut).
  useEffect(() => {
    if (!sceneShown || mode !== "WORLD_EXPLORE") return;
    return getZonePagination().registerTravelDriver((delta) =>
      rigHandleRef.current?.travelBy(delta * ENDLESS.periodX, delta * ENDLESS.periodZ),
    );
  }, [sceneShown, mode]);

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
        ? getCanvasDprRange(qualityTier, typeof screen === "undefined" ? 0 : screen.width * screen.height)
        : null,
    [sceneShown, qualityTier],
  );
  const krathongModels = useKrathongModelLoadStatus(); // MFW-65: owner-supplied model files (e2e waits for "ready")

  if (!sceneShown) return null;

  const settings = getSceneRenderSettings(qualityTier);
  const effectCaps = EFFECT_POOL_CAPS[qualityTier];

  return (
    <>
    <section
      aria-label="Toy-like night river preview"
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ backgroundColor: LIGHT_PRESETS[lightPreset].background }}
      data-light-preset={lightPreset}
      data-quality-tier={qualityTier}
      data-krathong-models={krathongModels}
      data-selected-target={selectedTarget ?? undefined}
      data-find-my={selectedTarget === "riverKrathong" ? "following" : undefined}
      data-interaction-mode={mode ?? undefined}
      data-zone-id={mode === "WORLD_EXPLORE" ? worldZoneId ?? undefined : undefined}
      data-stretch-index={mode === "WORLD_EXPLORE" ? currentStretch : undefined}
      data-streamed-zone-ids={stretches.map((slot) => slot.zoneId ?? "").join(",")}
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
            stretches={stretches}
            currentOffsetX={slots[0].offsetX}
            currentOffsetZ={slots[0].offsetZ}
            getRig={getRig}
            objectRotation={objectRotation}
            onTargetSelected={onTargetSelected}
            selectedLampIndex={selectedLampIndex}
            selectedLampStretch={selectedLampStretch}
            onLampSelected={onLampSelected}
            waterTargetRef={waterTargetRef}
            krathongTargetRef={krathongTargetRef}
            lampTargetRef={lampTargetRef}
            effectCaps={effectCaps}
            effectsRef={effectsRef}
            onWaterSelected={onWaterSelected}
            onRiverItemTapped={mode === "WORLD_EXPLORE" ? onRiverItemTapped : undefined}
            wishBubble={wishBubble}
            wishBubbleRef={wishBubbleRef}
            poseKind={poseKind}
            ritual={ritual}
            site={site}
            dragPointRef={dragPointRef}
            releaseDropRef={releaseDropRef}
            riverNow={riverNow}
            onTouchedDown={onTouchedDown}
            onSettled={onSettled}
            pierFocusRef={pierFocusRef}
            customizeFocusRef={customizeFocusRef}
            findMyAnchorRef={findMyAnchorRef}
            ownMarked={ownMarked}
            livingWorldIdleRedraw={mode === "WORLD_EXPLORE"}
            fireworkSparks={FIREWORK_SPARKS_PER_BURST[qualityTier]}
            smokePuffs={CHIMNEY_SMOKE_PUFFS_PER_TAP[qualityTier]}
            leavesPerFall={FALLING_LEAVES_PER_TAP[qualityTier]}
            lampGroundFan={BLOB_SHADOW_TIER_GEOMETRY[qualityTier]}
            onPropTapped={mode === "WORLD_EXPLORE" ? onPropTapped : undefined}
          />
          <CameraRig
            getRig={getRig}
            bounds={WORLD_PAN_BOUNDS}
            targetRef={cameraTargetRef}
            requestId={flyRequestId}
            reducedMotion={reducedMotion}
            handleRef={rigHandleRef}
            stretchFrame={ENDLESS}
            stretchIndex={currentStretch}
            onStretchChange={onStretchChange}
            flightYawRad={mode === "CUSTOMIZE" ? DEFAULT_VIEW_YAW_RAD : null}
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
          <SceneTapHint reducedMotion={reducedMotion} />
        </OverlaySlot>
      )}
      <span className="sr-only" aria-live="polite">
        {lastInteraction ? `Selected ${lastInteraction}` : ""}
      </span>
    </section>
    {/* Outside the section: its pointerdowns must not reach the gesture separator. */}
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
    {inspected && outcome === "panel" && (
      <OverlaySlot slot="sheet">
        <InspectPopup
          key={inspected.id}
          creation={inspected}
          onClose={() => setTapped(null)}
          ownerSection={<OwnerWishSection creation={inspected} />}
        />
      </OverlaySlot>
    )}
    {outcome === "bubble" && wishBubble !== null && inspected !== null && tapped !== null && (
      <WishBubble
        key={`${tapped.id}:${tapped.seq}`}
        creation={inspected}
        reducedMotion={reducedMotion}
        bubbleRef={wishBubbleRef}
        onDone={onBubbleDone}
      />
    )}
    </>
  );
}
