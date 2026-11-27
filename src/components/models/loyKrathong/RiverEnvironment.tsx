"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import type { Group, InstancedMesh, Mesh } from "three";
import { hasAnyTapProxyHit, hasTapProxyHit } from "@/components/canvas3d/effects/riverHitPick";
import { createTapProxy } from "@/components/canvas3d/effects/riverTapProxy";
import { isTapClick, tapPointInParentSpace } from "@/components/canvas3d/effects/tapPoint";
import { InstancedPart } from "@/components/canvas3d/InstancedPart";
import { createBankGeometry, createRibbonGeometry } from "@/components/canvas3d/geometry";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import {
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_GROUND_RENDER_ORDER,
} from "@/config/events/loyKrathong.river.config";
import { LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO, type SceneTargetKind } from "@/config/gimmicks.config";
import { VILLAGE_LIGHTS, type LightPresetId } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates";
import type { NudgeSource } from "@/core/effects";
import type { BankGeometryData, RibbonGeometryData, RiverEnvironmentLayout } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import {
  LOY_KRATHONG_RIVER_FOLIAGE,
  houseBodyForTier,
  lampHeadPosition,
  lampIndexFromInstanceId,
  lampTapProxyPlacement,
} from "./riverLayout";
import { RiversideFoliage } from "./RiversideFoliage";

export interface RiverEnvironmentProps {
  readonly layout: RiverEnvironmentLayout;
  readonly shadows: boolean;
  readonly waterRef: RefObject<Mesh | null>;
  /** tap = hit point in the parent (world-view group) space, or null when unavailable / the click ended a drag. */
  readonly onWaterSelected: (tap: WorldXZ | null) => void;
  readonly lampFocusRef: RefObject<Group | null>;
  readonly selectedLampIndex: number;
  readonly onLampSelected: (lampIndex: number) => void;
  /** Village windows and lanterns are lit at NIGHT and off at DAY (VILLAGE_LIGHTS, MFW-49 AC3). */
  readonly lightPreset: LightPresetId;
  /** MFW-50: receives the lamp-head InstancedMesh (lantern flicker), via the InstancedPart meshRef. Optional. */
  readonly lampHeadMeshRef?: RefObject<InstancedMesh | null>;
  /**
   * MFW-60 (WORLD_EXPLORE only): when set, a short tap on the ground or a bank that no tap proxy claims is a "sky" tap (a firework
   * above the tapped point), and a tap on the pier deck or piles is a pier tap. Absent = no extra raycast targets.
   */
  readonly onPropTapped?: (kind: SceneTargetKind, index: number, at: WorldXZ | null) => void;
  /** MFW-60: the shared nudge pool, passed on to the foliage (a tapped tree, bush or reed shakes). */
  readonly nudges?: NudgeSource | null;
  /** MFW-60: receive the rock InstancedMesh and the pier deck mesh (PropNudges bounces them). */
  readonly rockMeshRef?: RefObject<InstancedMesh | null>;
  readonly pierDeckRef?: RefObject<Mesh | null>;
}

function useRibbonGeometry(data: RibbonGeometryData) {
  const geometry = useMemo(() => createRibbonGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function useBankGeometry(data: BankGeometryData) {
  const geometry = useMemo(() => createBankGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/**
 * Low-poly riverside diorama (one stretch of the endless river, MFW-58): water, rounded banks on ground strips, a village (MFW-66: the owner house model — a vertex-coloured shell, its roof in two
 * colours by roof kind, and window glasses), foliage
 * (leaf-clump trees, bushes and reeds, MFW-70), rocks, lamps and a pier. No lights: windows and lanterns glow by emissive per
 * light preset. Only the foliage moves: it sways on HIGH and MEDIUM, and only on frames that are already rendered.
 */
export function RiverEnvironment(props: RiverEnvironmentProps) {
  const { layout, shadows, waterRef, lampFocusRef, selectedLampIndex, onWaterSelected, onLampSelected, lightPreset } = props;
  const { lampHeadMeshRef, onPropTapped, nudges = null, rockMeshRef, pierDeckRef } = props;
  const tier = useDeviceStore((s) => s.qualityTier);
  // Rule 5 (look doc §16): land = "sky" unless a proxy further along the ray takes the tap. Rule 3: the pier defers only to proxies.
  const onLandClick = onPropTapped
    ? (event: ThreeEvent<MouseEvent>) => {
        if (!isTapClick(event) || hasAnyTapProxyHit(event.intersections)) return;
        event.stopPropagation();
        onPropTapped("sky", 0, tapPointInParentSpace(event));
      }
    : undefined;
  const onPierClick = onPropTapped
    ? (event: ThreeEvent<MouseEvent>) => {
        if (!isTapClick(event) || hasTapProxyHit(event.intersections)) return;
        event.stopPropagation();
        onPropTapped("pier", 0, null);
      }
    : undefined;
  const water = useRibbonGeometry(layout.water);
  const bankLeft = useBankGeometry(layout.banks.left);
  const bankRight = useBankGeometry(layout.banks.right);
  const ground = useRibbonGeometry(layout.ground.strips); // MFW-58: the stretch's ground strips (faces up, local xz)
  const village = VILLAGE_LIGHTS[lightPreset];
  const parts = RIVER_ENVIRONMENT_PARTS;
  const lampProxy = useMemo(() => createTapProxy(LAMP_TAP_RADIUS), []);
  useEffect(() => () => lampProxy.dispose(), [lampProxy]);
  // MFW-60 polish: the proxy covers the whole lamp (post + head), so a tap on the post lights the lamp instead of a firework.
  const lampProxyPlacements = useMemo(
    () => layout.lamps.map((lamp) => lampTapProxyPlacement(lamp, parts.lampHead, LAMP_TAP_RADIUS, TAP_PROXY_INRADIUS_RATIO)),
    [layout.lamps, parts.lampHead],
  );
  const focusLamp = layout.lamps[selectedLampIndex] ?? layout.lamps[0];
  const { pier } = layout;
  return (
    <>
      <mesh
        ref={waterRef}
        name={SCENE_OBJECT_NAMES.water}
        geometry={water}
        position={[0, layout.waterSurfaceY, 0]}
        receiveShadow={shadows}
        onClick={(event) => {
          if (hasTapProxyHit(event.intersections)) return; // the proxy under the water takes this tap (MFW-59)
          event.stopPropagation();
          onWaterSelected(tapPointInParentSpace(event));
        }}
      >
        <meshStandardMaterial {...TOY_MATTE_MATERIALS.water} />
      </mesh>
      {/* Bank heights are absolute (the profile), so the bank meshes sit at y = 0. */}
      <mesh name={SCENE_OBJECT_NAMES.bankLeft} geometry={bankLeft} receiveShadow={shadows} onClick={onLandClick}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <mesh name={SCENE_OBJECT_NAMES.bankRight} geometry={bankRight} receiveShadow={shadows} onClick={onLandClick}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <mesh
        name={SCENE_OBJECT_NAMES.ground}
        geometry={ground}
        position={[0, layout.ground.y, 0]}
        renderOrder={RIVER_GROUND_RENDER_ORDER}
        receiveShadow={shadows}
        onClick={onLandClick}
      >
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <InstancedPart
        name={SCENE_OBJECT_NAMES.houseBodies}
        part={houseBodyForTier(tier)}
        transforms={layout.houses}
        shadows={shadows}
      />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.houseRoofs}
        part={parts.houseRoof}
        transforms={layout.housesByRoof.pyramid}
        shadows={shadows}
      />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.houseRoofsGable}
        part={parts.houseRoofGable}
        transforms={layout.housesByRoof.gable}
        shadows={shadows}
      />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.houseWindows}
        part={parts.houseWindow}
        transforms={layout.houseWindows}
        shadows={shadows}
        emissiveIntensity={village.windowEmissiveIntensity}
      />
      <RiversideFoliage foliage={LOY_KRATHONG_RIVER_FOLIAGE} shadows={shadows} nudges={nudges} />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.rocks}
        part={parts.rock}
        transforms={layout.rocks}
        shadows={shadows}
        meshRef={rockMeshRef}
      />
      <InstancedPart name={SCENE_OBJECT_NAMES.lampPosts} part={parts.lampPost} transforms={layout.lamps} shadows={shadows} />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.lampHeads}
        part={parts.lampHead}
        transforms={layout.lamps}
        shadows={shadows}
        emissiveIntensity={village.lanternEmissiveIntensity}
        meshRef={lampHeadMeshRef}
        onClick={(event) => {
          event.stopPropagation();
          onLampSelected(lampIndexFromInstanceId(event.instanceId, layout.lamps.length));
        }}
      />
      {lampProxyPlacements.map(({ position, scaleY }, i) => (
        <mesh
          key={i}
          name={`${SCENE_OBJECT_NAMES.lampTapPrefix}${i}`}
          geometry={lampProxy.geometry}
          material={lampProxy.material}
          visible={false}
          position={position}
          scale={[1, scaleY, 1]}
          onClick={(event) => {
            if (!isTapClick(event)) return;
            event.stopPropagation();
            onLampSelected(i);
          }}
        />
      ))}
      <mesh
        ref={pierDeckRef}
        name={SCENE_OBJECT_NAMES.pierDeck}
        position={[pier.deckCenter.x, pier.deckCenter.y, pier.deckCenter.z]}
        rotation={[0, pier.yawRad, 0]}
        castShadow={shadows}
        receiveShadow={shadows}
        onClick={onPierClick}
      >
        <boxGeometry args={[pier.width, pier.thickness, pier.length]} />
        <meshStandardMaterial {...PIER_DECK_MATERIAL} />
      </mesh>
      <InstancedPart
        name={SCENE_OBJECT_NAMES.pierPiles}
        part={parts.pierPile}
        transforms={pier.piles}
        shadows={shadows}
        onClick={onPierClick}
      />
      {focusLamp && (
        <group
          ref={lampFocusRef}
          name={SCENE_OBJECT_NAMES.lampFocus}
          position={lampHeadPosition(focusLamp, parts.lampHead.yOffset)}
        />
      )}
    </>
  );
}
