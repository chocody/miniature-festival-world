"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { OrthographicCamera, type Group, type InstancedMesh, type Mesh } from "three";
import {
  LOY_KRATHONG_PROP_TAP_TARGETS,
  LOY_KRATHONG_RIVER_LAYOUT,
  LOY_KRATHONG_STRETCH_EXTENT,
  RiverEnvironment,
  getRiverSceneryTopY,
} from "@/components/models/loyKrathong";
import { RIVER_ENVIRONMENT_PARTS } from "@/config/events/loyKrathong.river.config";
import type { SceneTargetKind } from "@/config/gimmicks.config";
import type { LightPresetId } from "@/config/look.config";
import type { CameraRigState } from "@/core/camera";
import type { WorldXZ } from "@/core/coordinates";
import type { NudgeSource } from "@/core/effects";
import {
  getLoyKrathongEndlessRiverFrame,
  getLoyKrathongRiverLanes,
  isStretchInView,
  orthoViewAlongHalfExtent,
} from "@/core/world";
import { AmbientMotes, LanternFlicker } from "./AmbientLife";
import { EnvironmentBlobShadows } from "./BlobShadows";
import { PropNudges } from "./effects/PropNudges";
import { PropTapProxies } from "./effects/PropTapProxies";
import { FindMyAnchor } from "./FindMyAnchor";
import { WishBubbleAnchor } from "./WishBubbleAnchor";
import { RiverFlow, type RiverFlowItem } from "./RiverFlow";
import { StretchVisibilityContext, type StretchVisibility } from "./stretchVisibility";
import { Villagers } from "./Villagers";
import { ShoreHighlights, WaterGlints } from "./WaterHighlights";

/** three `name` prefix of a stretch slot group (`river-stretch-<s>`; tests and probes look the current one up first). */
export const RIVER_STRETCH_NAME_PREFIX = "river-stretch-";

const FRAME = getLoyKrathongEndlessRiverFrame();
/** Height span the culling extent covers: the ground up to the tallest scenery (endlessRiver.test.ts proves the 3 slots suffice). */
const CULL_HEIGHT_SPAN = getRiverSceneryTopY() - LOY_KRATHONG_RIVER_LAYOUT.ground.y;

export interface RiverStretchProps {
  readonly stretchIndex: number;
  readonly offsetX: number;
  readonly offsetZ: number;
  /** The camera's stretch (rendered first). Informational: the current-only refs below are already null elsewhere. */
  readonly isCurrent: boolean;
  /** Stable; read per frame for the view culling. */
  readonly getRig: () => CameraRigState;
  /** Stable reference per zone (getZoneRiverItems / the current zone's excludeOwnAndCap memo). */
  readonly riverItems: readonly RiverFlowItem[];
  /** Only on the slot that holds the Find My anchor. */
  readonly markedRiverId: string | null;
  /** Non-null only on that slot. */
  readonly findMyItem: RiverFlowItem | null;
  readonly findMyAnchorRef: RefObject<Group | null>;
  /** Non-null only on the slot of the selected lamp (the fly-to target). */
  readonly lampFocusRef: RefObject<Group | null> | null;
  readonly selectedLampIndex: number;
  /** Current slot only (else null: a local ref). */
  readonly waterTargetRef: RefObject<Mesh | null> | null;
  /** tap = the hit point in world-view space (slot-local + s·T), or null. */
  readonly onWaterSelected: (tap: WorldXZ | null, stretchIndex: number) => void;
  readonly onLampSelected: (lampIndex: number, stretchIndex: number) => void;
  /** WORLD_EXPLORE only (absent = no prop proxies, no land / pier handlers). at = world-view space. */
  readonly onPropTapped?: (kind: SceneTargetKind, index: number, at: WorldXZ | null, stretchIndex: number) => void;
  /** The tap carries this slot's stretch index: with one zone every slot shows the same zone, so the id alone does not say which copy. */
  readonly onRiverItemTapped?: (id: string, stretchIndex: number) => void;
  /** MFW-80: the krathong whose wish bubble follows it; non-null only on the tapped slot. */
  readonly bubbleItem: RiverFlowItem | null;
  /** The bubble's outer element (written by WishBubbleAnchor each frame). */
  readonly wishBubbleRef: RefObject<HTMLDivElement | null>;
  /** The one nudge pool of the canvas (MFW-60); this slot reads it filtered by its stretch. */
  readonly nudges: NudgeSource;
  readonly lightPreset: LightPresetId;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  readonly riverNow: () => number;
  readonly pinnedRiverIds: readonly string[];
}

/**
 * MFW-58: one stretch copy of the endless river, drawn at s·T: the environment (with the MFW-70 foliage and MFW-60 shakes), blob
 * shadows, water highlights, villagers, motes and lantern flicker, the prop tap proxies and nudges, its zone's krathongs (RiverFlow,
 * today's per-zone cap) and the Find My anchor when it holds the focused krathong. Three persistent slots (keyed by ring index) are
 * re-used as the camera travels, so a seam crossing re-plans only the leapfrogged slot's krathongs and creates no GPU resource.
 * A slot outside the view is hidden per frame (group.visible, no React state) and its per-frame writers skip their work.
 */
export const RiverStretch = memo(function RiverStretch({
  stretchIndex,
  offsetX,
  offsetZ,
  getRig,
  riverItems,
  markedRiverId,
  findMyItem,
  findMyAnchorRef,
  lampFocusRef,
  selectedLampIndex,
  waterTargetRef,
  onWaterSelected,
  onLampSelected,
  onPropTapped,
  onRiverItemTapped,
  bubbleItem,
  wishBubbleRef,
  nudges,
  lightPreset,
  shadows,
  reducedMotion,
  riverNow,
  pinnedRiverIds,
}: RiverStretchProps) {
  const groupRef = useRef<Group | null>(null);
  const [visibility] = useState<StretchVisibility>(() => ({ visible: true }));
  const localWaterRef = useRef<Mesh | null>(null);
  const localLampFocusRef = useRef<Group | null>(null);
  const lampHeadMeshRef = useRef<InstancedMesh | null>(null);
  const rockMeshRef = useRef<InstancedMesh | null>(null);
  const pierDeckRef = useRef<Mesh | null>(null);
  const slotNudges = useMemo<NudgeSource>(() => ({ pool: nudges.pool, now: nudges.now, stretchIndex }), [nudges, stretchIndex]);

  const toWorld = useCallback(
    (at: WorldXZ | null): WorldXZ | null => (at === null ? null : { x: at.x + offsetX, z: at.z + offsetZ }),
    [offsetX, offsetZ],
  );
  const onWater = useCallback((tap: WorldXZ | null) => onWaterSelected(toWorld(tap), stretchIndex), [onWaterSelected, toWorld, stretchIndex]);
  const onLamp = useCallback((i: number) => onLampSelected(i, stretchIndex), [onLampSelected, stretchIndex]);
  const onRiverItem = useMemo(
    () => (onRiverItemTapped === undefined ? undefined : (id: string) => onRiverItemTapped(id, stretchIndex)),
    [onRiverItemTapped, stretchIndex],
  );
  const onProp = useMemo(
    () =>
      onPropTapped === undefined
        ? undefined
        : (kind: SceneTargetKind, index: number, at: WorldXZ | null) => onPropTapped(kind, index, toWorld(at), stretchIndex),
    [onPropTapped, toWorld, stretchIndex],
  );
  const onVillagerTapped = useMemo(
    () => (onProp === undefined ? undefined : (id: number) => onProp("villager", id, null)),
    [onProp],
  );

  // Culling: before every child's useFrame (priority −1 does not take over rendering). Writes only on a change.
  useFrame((state) => {
    const group = groupRef.current;
    if (group === null) return;
    const camera = state.camera;
    const rig = getRig();
    const visible =
      camera instanceof OrthographicCamera
        ? isStretchInView(
            FRAME,
            stretchIndex,
            LOY_KRATHONG_STRETCH_EXTENT,
            rig.focusX,
            rig.focusZ,
            orthoViewAlongHalfExtent(camera, rig.yawRad, FRAME, CULL_HEIGHT_SPAN),
          )
        : true;
    if (visible !== visibility.visible) {
      visibility.visible = visible;
      group.visible = visible;
    }
  }, -1);

  return (
    <StretchVisibilityContext.Provider value={visibility}>
      <group ref={groupRef} name={`${RIVER_STRETCH_NAME_PREFIX}${stretchIndex}`} position={[offsetX, 0, offsetZ]}>
        <RiverEnvironment
          layout={LOY_KRATHONG_RIVER_LAYOUT}
          shadows={shadows}
          waterRef={waterTargetRef ?? localWaterRef}
          onWaterSelected={onWater}
          lampFocusRef={lampFocusRef ?? localLampFocusRef}
          selectedLampIndex={selectedLampIndex}
          onLampSelected={onLamp}
          lightPreset={lightPreset}
          lampHeadMeshRef={lampHeadMeshRef}
          onPropTapped={onProp}
          nudges={slotNudges}
          rockMeshRef={rockMeshRef}
          pierDeckRef={pierDeckRef}
          now={riverNow}
        />
        {onProp && <PropTapProxies targets={LOY_KRATHONG_PROP_TAP_TARGETS} onPropTapped={onProp} />}
        <PropNudges
          nudges={slotNudges}
          rockMeshRef={rockMeshRef}
          rocks={LOY_KRATHONG_RIVER_LAYOUT.rocks}
          rockPart={RIVER_ENVIRONMENT_PARTS.rock}
          pierDeckRef={pierDeckRef}
        />
        <EnvironmentBlobShadows layout={LOY_KRATHONG_RIVER_LAYOUT} />
        <ShoreHighlights layout={LOY_KRATHONG_RIVER_LAYOUT} />
        <WaterGlints layout={LOY_KRATHONG_RIVER_LAYOUT} now={riverNow} />
        <Villagers layout={LOY_KRATHONG_RIVER_LAYOUT} now={riverNow} nudges={slotNudges} onVillagerTapped={onVillagerTapped} />
        <AmbientMotes layout={LOY_KRATHONG_RIVER_LAYOUT} now={riverNow} lightPreset={lightPreset} />
        <LanternFlicker now={riverNow} lightPreset={lightPreset} meshRef={lampHeadMeshRef} />
        <RiverFlow
          items={riverItems}
          lanes={getLoyKrathongRiverLanes()}
          shadows={shadows}
          reducedMotion={reducedMotion}
          now={riverNow}
          pinnedIds={pinnedRiverIds}
          onItemTapped={onRiverItem}
          shadowSurfaceY={LOY_KRATHONG_RIVER_LAYOUT.waterSurfaceY}
          markedId={markedRiverId}
        />
        {findMyItem && (
          <FindMyAnchor item={findMyItem} lanes={getLoyKrathongRiverLanes()} now={riverNow} anchorRef={findMyAnchorRef} />
        )}
        {bubbleItem && <WishBubbleAnchor item={bubbleItem} lanes={getLoyKrathongRiverLanes()} now={riverNow} bubbleRef={wishBubbleRef} />}
      </group>
    </StretchVisibilityContext.Provider>
  );
});
