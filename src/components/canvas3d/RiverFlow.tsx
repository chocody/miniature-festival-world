"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import { Matrix4, Vector3, type Group } from "three";
import { planKrathongInstances, RiverKrathongBatch, type RiverKrathongBatchHandle } from "@/components/models/loyKrathong";
import { RIVER_KRATHONG_BLOB_SHADOW_RADIUS } from "@/config/look.config";
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
import { DynamicBlobShadows, type DynamicBlobShadowsHandle } from "./BlobShadows";
import { createRiverTapProxy } from "./effects/riverTapProxy";
import { isTapClick } from "./effects/tapPoint";
import { pickNearestRiverHitId } from "./effects/riverHitPick";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

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
  /** World y of the water: when set, a soft blob shadow follows every krathong (MFW-47, one draw call). Undefined = no blobs. */
  readonly shadowSurfaceY?: number;
}

/**
 * Moves every krathong along the shared lane from its SplinePathCoord and the wall clock only (invariants A, B, F).
 * Renders at most min(ZONE_ITEM_CAP, TIER_BUDGETS[tier].riverItemCap) krathongs (MFW-24 perf review). Items are empty
 * anchor groups (transform, fly-to target); all their parts are drawn by one persistent RiverKrathongBatch
 * (≤ 17 draw calls per pass, MFW-34).
 */
export const RiverFlow = memo(function RiverFlow({
  items,
  lanes,
  shadows,
  reducedMotion,
  now = Date.now,
  pinnedIds = NO_PINNED_RIVER_IDS,
  onItemTapped,
  shadowSurfaceY,
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
  const plan = useMemo(() => planKrathongInstances(visible.map((item) => item.source.appearance)), [visible]);
  // Defensive: the batch capacity is ZONE_ITEM_CAP, so a plan never holds fewer items than `visible` in practice.
  const rendered = useMemo(
    () => (plan.items.length === visible.length ? visible : visible.slice(0, plan.items.length)),
    [visible, plan],
  );
  const batch = useRef<RiverKrathongBatchHandle | null>(null);
  const blobs = useRef<DynamicBlobShadowsHandle | null>(null);
  const bounceMatrix = useRef(new Matrix4());
  const bounceScale = useRef(new Vector3());
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
    if (rendered.length > 0) invalidate(); // start the demand loop when items appear
  }, [rendered, invalidate]);

  useFrame(() => {
    if (rendered.length === 0) {
      blobs.current?.commit(0);
      return;
    }
    const nowMs = now();
    const b = bounce.current;
    if (b.resetId !== null) {
      bounceGroups.current.get(b.resetId)?.scale.setScalar(1);
      b.resetId = null;
    }
    let bouncingId: string | null = null;
    let bounceFactor = 1;
    if (b.id !== null) {
      const node = bounceGroups.current.get(b.id);
      const f = writeBounceAt(nowMs - b.startMs, reducedMotion, bounceOut.current);
      node?.scale.setScalar(f.scale);
      bouncingId = b.id;
      bounceFactor = f.scale;
      if (f.done || !node) b.id = null;
    }
    const target = batch.current;
    for (let i = 0; i < rendered.length; i++) {
      const item = rendered[i];
      const group = groups.current.get(item.id);
      if (!group) continue;
      applyRiverItemTransform(group, item, nowMs, reducedMotion, scratch.current);
      blobs.current?.writeAt(i, group.position.x, group.position.z);
      group.updateMatrix(); // position · rotation (YXZ) · RIVER_KRATHONG_SCALE → group.matrix
      if (item.id === bouncingId) {
        // The bounce scales the model about the anchor origin: M · S(f), exactly what the bounce child group did.
        bounceMatrix.current.copy(group.matrix).scale(bounceScale.current.setScalar(bounceFactor));
        target?.writeItem(i, bounceMatrix.current, group.quaternion);
      } else {
        target?.writeItem(i, group.matrix, group.quaternion);
      }
    }
    target?.commit();
    blobs.current?.commit(rendered.length);
    invalidate(); // keep the demand canvas rendering while krathongs drift (also under reduced motion)
  });

  return (
    <>
      {rendered.length > 0 && (
        <group name="river-flow">
          {rendered.map((item) => (
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
              {/* Legacy anchor from MFW-28: its scale carries the bounce factor (kept for its tests); the batch gets the factor via the matrix. */}
              <group
                name={`river-bounce-${item.id}`}
                ref={(node: Group | null) => {
                  if (!node) return;
                  bounceGroups.current.set(item.id, node);
                  return () => {
                    bounceGroups.current.delete(item.id);
                  };
                }}
              />
              {hitProxy && (
                <mesh
                  name={`${SCENE_OBJECT_NAMES.riverHitPrefix}${item.id}`}
                  geometry={hitProxy.geometry}
                  material={hitProxy.material}
                  visible={false}
                  onClick={(event: ThreeEvent<MouseEvent>) => {
                    if (!isTapClick(event)) return;
                    event.stopPropagation(); // the water behind must not also ripple
                    const id = pickNearestRiverHitId(event.intersections, event.ray) ?? item.id;
                    const b = bounce.current;
                    if (b.id !== null && b.id !== id) b.resetId = b.id;
                    b.id = id;
                    b.startMs = now();
                    invalidate();
                    onItemTapped?.(id);
                  }}
                />
              )}
            </group>
          ))}
        </group>
      )}
      <RiverKrathongBatch ref={batch} plan={plan} shadows={castShadow} />
      {shadowSurfaceY !== undefined && (
        <DynamicBlobShadows
          ref={blobs}
          name={SCENE_OBJECT_NAMES.riverBlobShadows}
          capacity={ZONE_ITEM_CAP}
          surfaceY={shadowSurfaceY}
          radius={RIVER_KRATHONG_BLOB_SHADOW_RADIUS}
        />
      )}
    </>
  );
});
