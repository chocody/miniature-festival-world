"use client";

import { useEffect, useMemo, type RefObject } from "react";
import type { Group, Mesh } from "three";
import { hasTapProxyHit } from "@/components/canvas3d/effects/riverHitPick";
import { createTapProxy } from "@/components/canvas3d/effects/riverTapProxy";
import { isTapClick, tapPointInParentSpace } from "@/components/canvas3d/effects/tapPoint";
import { InstancedPart } from "@/components/canvas3d/InstancedPart";
import { createRibbonGeometry } from "@/components/canvas3d/geometry";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import {
  PIER_DECK_MATERIAL,
  RIVER_BANK_MATERIAL,
  RIVER_ENVIRONMENT_PARTS,
} from "@/config/events/loyKrathong.river.config";
import { LAMP_TAP_RADIUS } from "@/config/gimmicks.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import type { WorldXZ } from "@/core/coordinates";
import type { RibbonGeometryData, RiverEnvironmentLayout } from "@/core/world";
import { lampHeadPosition, lampIndexFromInstanceId } from "./riverLayout";

export interface RiverEnvironmentProps {
  readonly layout: RiverEnvironmentLayout;
  readonly shadows: boolean;
  readonly waterRef: RefObject<Mesh | null>;
  /** tap = hit point in the parent (world-view group) space, or null when unavailable / the click ended a drag. */
  readonly onWaterSelected: (tap: WorldXZ | null) => void;
  readonly lampFocusRef: RefObject<Group | null>;
  readonly selectedLampIndex: number;
  readonly onLampSelected: (lampIndex: number) => void;
}

function useRibbonGeometry(data: RibbonGeometryData) {
  const geometry = useMemo(() => createRibbonGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Static low-poly riverside diorama: water, banks, houses, trees, lamps and a pier. No animation, no lights. */
export function RiverEnvironment(props: RiverEnvironmentProps) {
  const { layout, shadows, waterRef, lampFocusRef, selectedLampIndex, onWaterSelected, onLampSelected } = props;
  const water = useRibbonGeometry(layout.water);
  const bankLeft = useRibbonGeometry(layout.banks.left);
  const bankRight = useRibbonGeometry(layout.banks.right);
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
      <mesh name={SCENE_OBJECT_NAMES.bankLeft} geometry={bankLeft} position={[0, layout.bankTopY, 0]} receiveShadow={shadows}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <mesh name={SCENE_OBJECT_NAMES.bankRight} geometry={bankRight} position={[0, layout.bankTopY, 0]} receiveShadow={shadows}>
        <meshStandardMaterial {...RIVER_BANK_MATERIAL} />
      </mesh>
      <InstancedPart name={SCENE_OBJECT_NAMES.houseBodies} part={parts.houseBody} transforms={layout.houses} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.houseRoofs} part={parts.houseRoof} transforms={layout.houses} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.treeTrunks} part={parts.treeTrunk} transforms={layout.trees} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.treeCanopies} part={parts.treeCanopy} transforms={layout.trees} shadows={shadows} />
      <InstancedPart name={SCENE_OBJECT_NAMES.lampPosts} part={parts.lampPost} transforms={layout.lamps} shadows={shadows} />
      <InstancedPart
        name={SCENE_OBJECT_NAMES.lampHeads}
        part={parts.lampHead}
        transforms={layout.lamps}
        shadows={shadows}
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
