"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { KrathongModel } from "@/components/models/loyKrathong";
import { RIVER_KRATHONG_SCALE } from "@/config/riverFlow.config";
import type { RiverLaneSet, SplinePathCoord } from "@/core/coordinates";
import type { KrathongAppearance } from "@/core/customization";
import { applyRiverItemTransform, createRiverFrameScratch, prepareRiverItems } from "@/core/world";

/** One krathong on the shared river. Public data only (invariant C): no owner token, hash or private wish. */
export interface RiverFlowItem {
  readonly id: string;
  readonly coord: SplinePathCoord;
  readonly createdAtMs: number; // creations_public.created_at parsed to epoch ms
  readonly appearance: KrathongAppearance;
}

export interface RiverFlowProps {
  readonly items: readonly RiverFlowItem[];
  readonly lanes: RiverLaneSet;
  readonly shadows: boolean;
  readonly reducedMotion: boolean;
  /** Wall clock in epoch ms; default Date.now. Injectable for tests and a later server-time correction. */
  readonly now?: () => number;
}

/** Moves every krathong along the shared lane from its SplinePathCoord and the wall clock only (invariants A, B, F). */
export function RiverFlow({ items, lanes, shadows, reducedMotion, now = Date.now }: RiverFlowProps) {
  const invalidate = useThree((state) => state.invalidate);
  const prepared = useMemo(() => prepareRiverItems(items, lanes), [items, lanes]);
  const groups = useRef(new Map<string, Group>());
  const scratch = useRef(createRiverFrameScratch());

  useEffect(() => {
    if (prepared.length > 0) invalidate(); // start the demand loop when items appear
  }, [prepared, invalidate]);

  useFrame(() => {
    if (prepared.length === 0) return;
    const nowMs = now();
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i];
      const group = groups.current.get(item.id);
      if (group) applyRiverItemTransform(group, item, nowMs, reducedMotion, scratch.current);
    }
    invalidate(); // keep the demand canvas rendering while krathongs drift (also under reduced motion)
  });

  if (prepared.length === 0) return null;
  return (
    <group name="river-flow">
      {prepared.map((item) => (
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
          <KrathongModel appearance={item.source.appearance} shadows={shadows} />
        </group>
      ))}
    </group>
  );
}
