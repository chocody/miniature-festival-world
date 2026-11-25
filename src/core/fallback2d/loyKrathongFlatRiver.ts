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

let cached: LoyKrathongFlatRiver | null = null;

/** The ONE 2D river of Loy Krathong, built from the same lane and environment definitions as 3D (invariant B). Built on first call, then the same object. */
export function getLoyKrathongFlatRiver(): LoyKrathongFlatRiver {
  if (cached) return cached;
  const lanes = createFlatLaneSet(LOY_KRATHONG_RIVER_LANES);
  const scene = resolveFlatRiverScene(
    LOY_KRATHONG_RIVER_ENVIRONMENT,
    FLAT_RIVER_VISIBLE_BANK_DEPTH,
    FLAT_RIVER_END_MARGIN_PROGRESS,
  );
  const projection = createFlatRiverProjection(scene.bounds, FLAT_RIVER_VIEW_HEIGHT_PX, FLAT_RIVER_PADDING_PX);
  cached = Object.freeze({ lanes, scene, projection });
  return cached;
}
