import {
  FLAT_RIVER_END_MARGIN_PROGRESS,
  FLAT_RIVER_PADDING_PX,
  FLAT_RIVER_VIEW_HEIGHT_PX,
  FLAT_RIVER_VISIBLE_BANK_DEPTH,
} from "@/config/fallback2d.config";
import { LOY_KRATHONG_RIVER_ENVIRONMENT, LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createFlatLaneSet, type FlatLaneSet } from "./flatLane";
import { createFlatRiverProjection } from "./flatRiverFrame";
import { resolveFlatRiverScene, type FlatRiverScene } from "./flatRiverScene";
import type { TopDownProjection } from "./topDownProjection";

export interface LoyKrathongFlatRiver {
  readonly lanes: FlatLaneSet;
  readonly scene: FlatRiverScene;
  readonly projection: TopDownProjection;
}

interface FlatRiverBase {
  readonly lanes: FlatLaneSet;
  readonly scene: FlatRiverScene;
}

let base: FlatRiverBase | null = null;
let defaultRiver: LoyKrathongFlatRiver | null = null;
/** Bounded cache: only the most recent non-default height is kept, so dragging a window never grows memory. */
let lastSized: LoyKrathongFlatRiver | null = null;

function getBase(): FlatRiverBase {
  if (base) return base;
  base = Object.freeze({
    lanes: createFlatLaneSet(LOY_KRATHONG_RIVER_LANES),
    scene: resolveFlatRiverScene(
      LOY_KRATHONG_RIVER_ENVIRONMENT,
      FLAT_RIVER_VISIBLE_BANK_DEPTH,
      FLAT_RIVER_END_MARGIN_PROGRESS,
    ),
  });
  return base;
}

function build(heightPx: number): LoyKrathongFlatRiver {
  const { lanes, scene } = getBase();
  return Object.freeze({ lanes, scene, projection: createFlatRiverProjection(scene.bounds, heightPx, FLAT_RIVER_PADDING_PX) });
}

/** The ONE 2D river, at a map height in CSS px (default FLAT_RIVER_VIEW_HEIGHT_PX). Lanes and scene are built once and shared by every height (invariant B). */
export function getLoyKrathongFlatRiver(heightPx?: number): LoyKrathongFlatRiver {
  const rounded = Math.round(heightPx ?? FLAT_RIVER_VIEW_HEIGHT_PX);
  const h = Number.isFinite(rounded) && rounded > 2 * FLAT_RIVER_PADDING_PX ? rounded : FLAT_RIVER_VIEW_HEIGHT_PX;
  if (h === FLAT_RIVER_VIEW_HEIGHT_PX) {
    defaultRiver ??= build(FLAT_RIVER_VIEW_HEIGHT_PX);
    return defaultRiver;
  }
  if (lastSized?.projection.viewport.height !== h) lastSized = build(h);
  return lastSized;
}
