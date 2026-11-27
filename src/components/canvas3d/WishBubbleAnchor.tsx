"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Vector3, type Group } from "three";
import { WISH_BUBBLE_LIFT_WORLD, WISH_BUBBLE_MIN_MOVE_PX } from "@/config/inspect.config";
import { createSplinePoseOut, type RiverLaneSet } from "@/core/coordinates";
import { prepareRiverItems, writeFindMyAnchorPosition } from "@/core/world";
import type { RiverFlowItem } from "./RiverFlow";
import { useStretchVisibility } from "./stretchVisibility";
import { isInsideViewport, shouldMoveBubble, projectObjectToViewport, type MutablePoint } from "./wishBubbleProjection";

/** Local to this ticket: not in the shared sceneObjectNames registry (keeps parallel lanes conflict-free). */
export const WISH_BUBBLE_ANCHOR_NAME = "scene-wish-bubble-anchor";

export interface WishBubbleAnchorProps {
  readonly item: RiverFlowItem;
  readonly lanes: RiverLaneSet;
  /** Same clock as RiverFlow (riverNow). Default Date.now. */
  readonly now?: () => number;
  /** The bubble's outer element: only this component writes its style.transform / style.visibility. */
  readonly bubbleRef: RefObject<HTMLDivElement | null>;
}

/**
 * Empty group at the tapped krathong's current lane position (MFW-80). Each frame it projects that position, lifted by
 * WISH_BUBBLE_LIFT_WORLD, to the viewport and moves the DOM bubble there. The position is derived from the stored SplinePathCoord
 * (invariants A, B). It never invalidates: RiverFlow already redraws every frame while krathongs drift. No per-frame allocation.
 */
export function WishBubbleAnchor({ item, lanes, now = Date.now, bubbleRef }: WishBubbleAnchorProps) {
  const prepared = useMemo(() => prepareRiverItems([item], lanes)[0] ?? null, [item, lanes]);
  const visibility = useStretchVisibility();
  const groupRef = useRef<Group | null>(null);
  // Scratch objects, created once per mount (a render-time allocation only on re-render, never per frame).
  const scratch = useRef<{ pose: ReturnType<typeof createSplinePoseOut>; v: Vector3; px: MutablePoint; lastStore: MutablePoint } | null>(null);
  if (scratch.current === null) scratch.current = { pose: createSplinePoseOut(), v: new Vector3(), px: { x: 0, y: 0 }, lastStore: { x: 0, y: 0 } };
  const lastRef = useRef<MutablePoint | null>(null);
  const lastElRef = useRef<HTMLDivElement | null>(null);

  useFrame((state) => {
    const el = bubbleRef.current;
    const group = groupRef.current;
    const sc = scratch.current;
    if (el === null || group === null || prepared === null || sc === null) return;
    const { pose: poseScratch, v, px, lastStore } = sc;
    if (lastElRef.current !== el) {
      // A new bubble element mounts hidden (re-tap, new item in the slot): forget the old position so the first frame writes it.
      lastElRef.current = el;
      lastRef.current = null;
    }
    if (!visibility.visible) {
      el.style.visibility = "hidden";
      lastRef.current = null;
      return;
    }
    writeFindMyAnchorPosition(group, prepared, now(), poseScratch);
    projectObjectToViewport(group, WISH_BUBBLE_LIFT_WORLD, state.camera, state.size, v, px);
    if (!isInsideViewport(px, state.size)) {
      el.style.visibility = "hidden";
      lastRef.current = null;
      return;
    }
    if (shouldMoveBubble(lastRef.current, px, WISH_BUBBLE_MIN_MOVE_PX)) {
      el.style.transform = `translate3d(${px.x}px, ${px.y}px, 0)`;
      el.style.visibility = "visible";
      lastStore.x = px.x;
      lastStore.y = px.y;
      lastRef.current = lastStore;
    }
  });

  if (prepared === null) return null;
  return <group ref={groupRef} name={WISH_BUBBLE_ANCHOR_NAME} />;
}
