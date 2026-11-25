"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import { createSplinePoseOut, type RiverLaneSet } from "@/core/coordinates";
import { getRiverItemPositionAt, prepareRiverItems, writeFindMyAnchorPosition } from "@/core/world";
import type { RiverFlowItem } from "./RiverFlow";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

export interface FindMyAnchorProps {
  readonly item: RiverFlowItem;
  readonly lanes: RiverLaneSet;
  /** Same clock as RiverFlow (MFW-23 riverNow). Default Date.now. */
  readonly now?: () => number;
  readonly anchorRef: RefObject<Group | null>;
}

/**
 * Empty group at the focused krathong's current lane position (MFW-30). It is the camera fly-to target and the highlight's follow target.
 * Position comes from the stored SplinePathCoord at render time (invariants A, B), so it works whoever draws the krathong
 * (RiverFlow batch, OwnKrathong) and also for tier-hidden items.
 */
export function FindMyAnchor({ item, lanes, now = Date.now, anchorRef }: FindMyAnchorProps) {
  const invalidate = useThree((state) => state.invalidate);
  const prepared = useMemo(() => prepareRiverItems([item], lanes)[0] ?? null, [item, lanes]);
  // Mount position: the camera flight reads the anchor in the same commit, before the first frame runs.
  const startPosition = useMemo(() => {
    if (prepared === null) return null;
    const p = getRiverItemPositionAt(prepared, lanes, now());
    return p === null ? null : ([p.world.x, p.world.y, p.world.z] as [number, number, number]);
  }, [prepared, lanes, now]);
  const scratch = useRef(createSplinePoseOut());

  useFrame(() => {
    const node = anchorRef.current;
    if (node === null || prepared === null) return;
    writeFindMyAnchorPosition(node, prepared, now(), scratch.current);
    invalidate(); // the krathong keeps drifting, also under reduced motion (owner decision 23)
  });

  if (prepared === null || startPosition === null) return null;
  return <group ref={anchorRef} name={SCENE_OBJECT_NAMES.findMyAnchor} position={startPosition} />;
}
