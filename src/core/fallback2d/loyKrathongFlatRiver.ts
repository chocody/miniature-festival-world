import {
  FLAT_RIVER_END_MARGIN_PROGRESS,
  FLAT_RIVER_PADDING_PX,
  FLAT_RIVER_VIEW_HEIGHT_PX,
  FLAT_RIVER_VILLAGER_COUNT,
  FLAT_RIVER_VISIBLE_BANK_DEPTH,
} from "@/config/fallback2d.config";
import { LOY_KRATHONG_VILLAGERS } from "@/config/events/loyKrathong.life.config";
import {
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
  LOY_KRATHONG_RIVER_LANES,
  LOY_KRATHONG_RIVERSIDE_PATHS,
} from "@/config/events/loyKrathong.river.config";
import { createFlatLaneSet, type FlatLaneSet } from "./flatLane";
import { createFlatRiverProjection } from "./flatRiverFrame";
import { resolveFlatRiverScene, type FlatRiverScene } from "./flatRiverScene";
import { resolveFlatVillagers, type FlatVillager } from "./flatVillagers";
import type { TopDownProjection } from "./topDownProjection";

export interface LoyKrathongFlatRiver {
  readonly lanes: FlatLaneSet;
  readonly scene: FlatRiverScene;
  /** The LOW living world's standing villagers (MFW-51), from the same path config as 3D. */
  readonly villagers: readonly FlatVillager[];
  readonly projection: TopDownProjection;
}

interface FlatRiverBase {
  readonly lanes: FlatLaneSet;
  readonly scene: FlatRiverScene;
  readonly villagers: readonly FlatVillager[];
}

let base: FlatRiverBase | null = null;
let defaultRiver: LoyKrathongFlatRiver | null = null;
/** Bounded cache: only the most recent non-default height is kept, so dragging a window never grows memory. */
let lastSized: LoyKrathongFlatRiver | null = null;

function getBase(): FlatRiverBase {
  if (base) return base;
  const scene = resolveFlatRiverScene(
    LOY_KRATHONG_RIVER_ENVIRONMENT,
    LOY_KRATHONG_RIVER_FOLIAGE_DEFINITION,
    FLAT_RIVER_VISIBLE_BANK_DEPTH,
    FLAT_RIVER_END_MARGIN_PROGRESS,
  );
  base = Object.freeze({
    lanes: createFlatLaneSet(LOY_KRATHONG_RIVER_LANES),
    scene,
    villagers: resolveFlatVillagers(scene.channel, LOY_KRATHONG_RIVERSIDE_PATHS, LOY_KRATHONG_VILLAGERS, FLAT_RIVER_VILLAGER_COUNT),
  });
  return base;
}

function build(heightPx: number): LoyKrathongFlatRiver {
  const { lanes, scene, villagers } = getBase();
  return Object.freeze({ lanes, scene, villagers, projection: createFlatRiverProjection(scene.bounds, heightPx, FLAT_RIVER_PADDING_PX) });
}

/** The ONE 2D river, at a map height in CSS px (default FLAT_RIVER_VIEW_HEIGHT_PX). Lanes, scene and villagers are built once and shared by every height (invariant B). */
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
