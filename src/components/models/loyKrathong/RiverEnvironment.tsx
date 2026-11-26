"use client";

import { useEffect, useMemo, type RefObject } from "react";
import type { Group, Mesh } from "three";
import { hasTapProxyHit } from "@/components/canvas3d/effects/riverHitPick";
import { createTapProxy } from "@/components/canvas3d/effects/riverTapProxy";
import { isTapClick, tapPointInParentSpace } from "@/components/canvas3d/effects/tapPoint";
import { InstancedPart } from "@/components/canvas3d/InstancedPart";
import { createBankGeometry, createGroundGeometry, createRibbonGeometry } from "@/components/canvas3d/geometry";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import {
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
  RIVER_GROUND_RENDER_ORDER,
} from "@/config/events/loyKrathong.river.config";
import { LAMP_TAP_RADIUS } from "@/config/gimmicks.config";
import { VILLAGE_LIGHTS, type LightPresetId } from "@/config/look.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates";
import type { BankGeometryData, RibbonGeometryData, RiverEnvironmentLayout } from "@/core/world";
import { LOY_KRATHONG_RIVER_FOLIAGE, lampHeadPosition, lampIndexFromInstanceId } from "./riverLayout";
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
 * Low-poly riverside diorama: water, rounded banks on a ground disc, a village (two roof kinds, doors, windows), foliage
 * (leaf-clump trees, bushes and reeds, MFW-70), rocks, lamps and a pier. No lights: windows and lanterns glow by emissive per
 * light preset. Only the foliage moves: it sways on HIGH and MEDIUM, and only on frames that are already rendered.
 */
export function RiverEnvironment(props: RiverEnvironmentProps) {
  const { layout, shadows, waterRef, lampFocusRef, selectedLampIndex, onWaterSelected, onLampSelected, lightPreset } = props;
  const water = useRibbonGeometry(layout.water);
  const bankLeft = useBankGeometry(layout.banks.left);
  const bankRight = useBankGeometry(layout.banks.right);
  const ground = useMemo(() => createGroundGeometry(layout.ground), [layout.ground]);
  useEffect(() => () => ground.dispose(), [ground]);
  const village = VILLAGE_LIGHTS[lightPreset];
  const parts = RIVER_ENVIRONMENT_PARTS;
  const lampProxy = useMemo(() => createTapProxy(LAMP_TAP_RADIUS), []);
  useEffect(() => () => lampProxy.dispose(), [lampProxy]);
  const lampProxyPositions = useMemo(
    () => layout.lamps.map((lamp) => lampHeadPosition(lamp, parts.lampHead.yOffset)),
    [layout.lamps, parts.lampHead.yOffset],
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
      <mesh name={SCENE_OBJECT_NAMES.bankLeft} geometry={bankLeft} receiveShadow={shadows}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <mesh name={SCENE_OBJECT_NAMES.bankRight} geometry={bankRight} receiveShadow={shadows}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <mesh
        name={SCENE_OBJECT_NAMES.ground}
        geometry={ground}
        position={[0, layout.ground.y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RIVER_GROUND_RENDER_ORDER}
        receiveShadow={shadows}
      >
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <InstancedPart name={SCENE_OBJECT_NAMES.houseBodies} part={parts.houseBody} transforms={layout.houses} shadows={shadows} />
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
      <InstancedPart name={SCENE_OBJECT_NAMES.houseDoors} part={parts.houseDoor} transforms={layout.houseDoors} shadows={shadows} />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.houseWindows}
        part={parts.houseWindow}
        transforms={layout.houseWindows}
        shadows={shadows}
        emissiveIntensity={village.windowEmissiveIntensity}
      />
      <RiversideFoliage foliage={LOY_KRATHONG_RIVER_FOLIAGE} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.rocks} part={parts.rock} transforms={layout.rocks} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.lampPosts} part={parts.lampPost} transforms={layout.lamps} shadows={shadows} />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.lampHeads}
        part={parts.lampHead}
        transforms={layout.lamps}
        shadows={shadows}
        emissiveIntensity={village.lanternEmissiveIntensity}
        onClick={(event) => {
          event.stopPropagation();
          onLampSelected(lampIndexFromInstanceId(event.instanceId, layout.lamps.length));
        }}
      />
      {lampProxyPositions.map((position, i) => (
        <mesh
          key={i}
          name={`${SCENE_OBJECT_NAMES.lampTapPrefix}${i}`}
          geometry={lampProxy.geometry}
          material={lampProxy.material}
          visible={false}
          position={position}
          onClick={(event) => {
            if (!isTapClick(event)) return;
            event.stopPropagation();
            onLampSelected(i);
          }}
        />
      ))}
      <mesh
        name={SCENE_OBJECT_NAMES.pierDeck}
        position={[pier.deckCenter.x, pier.deckCenter.y, pier.deckCenter.z]}
        rotation={[0, pier.yawRad, 0]}
        castShadow={shadows}
        receiveShadow={shadows}
      >
        <boxGeometry args={[pier.width, pier.thickness, pier.length]} />
        <meshStandardMaterial {...PIER_DECK_MATERIAL} />
      </mesh>
      <InstancedPart name={SCENE_OBJECT_NAMES.pierPiles} part={parts.pierPile} transforms={pier.piles} shadows={shadows} />
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
