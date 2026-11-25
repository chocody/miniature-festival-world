"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { KrathongModel } from "@/components/models/loyKrathong";
import { TIER_BUDGETS } from "@/config/performance.config";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { RiverLaneSet, SplinePathCoord } from "@/core/coordinates";
import type { KrathongAppearance } from "@/core/customization";
import { createBounceFrame, writeBounceAt } from "@/core/effects";
import {
  applyRiverItemTransform,
  createRiverFrameScratch,
  NO_PINNED_RIVER_IDS,
  prepareRiverItems,
  selectVisibleRiverItems,
} from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { createRiverTapProxy } from "./effects/riverTapProxy";
import { isTapClick } from "./effects/tapPoint";

/** One krathong on the shared river. Public data only (invariant C): no owner token, hash or private wish. */
export interface RiverFlowItem {
  readonly id: string;
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number; // creations_public.created_at parsed to epoch ms
  readonly appearance: KrathongAppearance;
  /** creations_public public wish (already moderated). RiverFlow ignores it; the InspectPopup (MFW-28) shows it. */
  readonly publicWishText?: string | null;
}

export interface RiverFlowProps {
  readonly items: readonly RiverFlowItem[];
  readonly lanes: RiverLaneSet;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  /** Wall clock in epoch ms; default Date.now. Injectable for tests and a later server-time correction. */
  readonly now?: () => number;
  /** Ids always rendered even above the tier cap (Find My target, MFW-30). Default none. */
  readonly pinnedIds?: readonly string[];
  /** WORLD_EXPLORE only. When it is absent, items are not tappable: no hit proxies, no handlers. */
  readonly onItemTapped?: (id: string) => void;
}

/**
 * Moves every krathong along the shared lane from its SplinePathCoord and the wall clock only (invariants A, B, F).
 * Renders at most min(ZONE_ITEM_CAP, TIER_BUDGETS[tier].riverItemCap) krathongs (MFW-24 perf review). Each is a full
 * KrathongModel (about 20 meshes); MFW-34 instancing is the real fix.
 */
export function RiverFlow({
  items,
  lanes,
  shadows,
  reducedMotion,
  now = Date.now,
  pinnedIds = NO_PINNED_RIVER_IDS,
  onItemTapped,
}: RiverFlowProps) {
  const invalidate = useThree((state) => state.invalidate);
  const qualityTier = useDeviceStore((state) => state.qualityTier);
  const budget = qualityTier === "FALLBACK_2D" ? null : TIER_BUDGETS[qualityTier];
  const visibleCap = budget === null ? 0 : Math.min(ZONE_ITEM_CAP, budget.riverItemCap); // perf gate (a) + (b)
  const castShadow = shadows && budget !== null && budget.riverItemCastShadow;
  const prepared = useMemo(() => prepareRiverItems(items, lanes), [items, lanes]);
  const visible = useMemo(
    () => selectVisibleRiverItems(prepared, visibleCap, pinnedIds),
    [prepared, visibleCap, pinnedIds],
  );
  const groups = useRef(new Map<string, Group>());
  const scratch = useRef(createRiverFrameScratch());
  const bounceGroups = useRef(new Map<string, Group>());
  /** One bouncing krathong at a time (the latest tap). resetId: the previous one, set back to scale 1 on the next frame. */
  const bounce = useRef<{ id: string | null; startMs: number; resetId: string | null }>({ id: null, startMs: 0, resetId: null });
  const bounceOut = useRef(createBounceFrame());
  const tappable = onItemTapped !== undefined;
  const hitProxy = useMemo(() => (tappable ? createRiverTapProxy() : null), [tappable]);
  useEffect(() => () => hitProxy?.dispose(), [hitProxy]);

  useEffect(() => {
    if (visible.length > 0) invalidate(); // start the demand loop when items appear
  }, [visible, invalidate]);

  useFrame(() => {
    if (visible.length === 0) return;
    const nowMs = now();
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const group = groups.current.get(item.id);
      if (group) applyRiverItemTransform(group, item, nowMs, reducedMotion, scratch.current);
    }
    const b = bounce.current;
    if (b.resetId !== null) {
      bounceGroups.current.get(b.resetId)?.scale.setScalar(1);
      b.resetId = null;
    }
    if (b.id !== null) {
      const node = bounceGroups.current.get(b.id);
      const f = writeBounceAt(nowMs - b.startMs, reducedMotion, bounceOut.current);
      node?.scale.setScalar(f.scale);
      if (f.done || !node) b.id = null;
    }
    invalidate(); // keep the demand canvas rendering while krathongs drift (also under reduced motion)
  });

  if (visible.length === 0) return null;
  return (
    <group name="river-flow">
      {visible.map((item) => (
        <group
          key={item.id}
          name={`river-item-${item.id}`}
          scale={RIVER_KRATHONG_SCALE}
          ref={(node: Group | null) => {
            if (!node) return;
            groups.current.set(item.id, node);
            return () => {
              groups.current.delete(item.id);
            };
          }}
        >
          <group
            name={`river-bounce-${item.id}`}
            ref={(node: Group | null) => {
              if (!node) return;
              bounceGroups.current.set(item.id, node);
              return () => {
                bounceGroups.current.delete(item.id);
              };
            }}
          >
            <KrathongModel appearance={item.source.appearance} shadows={castShadow} />
          </group>
          {hitProxy && (
            <mesh
              name={`river-hit-${item.id}`}
              geometry={hitProxy.geometry}
              material={hitProxy.material}
              visible={false}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (!isTapClick(event)) return;
                event.stopPropagation(); // the water behind must not also ripple
                const b = bounce.current;
                if (b.id !== null && b.id !== item.id) b.resetId = b.id;
                b.id = item.id;
                b.startMs = now();
                invalidate();
                onItemTapped?.(item.id);
              }}
            />
          )}
        </group>
      ))}
    </group>
  );
}
