import type { RiverLaneDefinition, WorldVec3 } from "@/core/coordinates";
import { RIVER_COLLISION_RADIUS } from "@/config/riverFlow.config";
import { SPLINE_LATERAL_OFFSET_LIMIT } from "@/config/ritual.config";

/*
 * River lane, channel and pier release spot of the Loy Krathong world: plain numbers, no scene parts (MFW-66). Split out of
 * loyKrathong.river.config.ts (which re-exports everything here) so the eager release path (services/api/releaseCreation.ts
 * via FlowRoot) does not pull in the scene parts and the generated house model; those stay in the lazy canvas chunk.
 * Guarded by tests/unit/river-config-boundary.test.ts.
 */

/** Water surface height (existing: the MFW-15 disc sat at y = -0.24). */
export const RIVER_WATER_SURFACE_Y = -0.24;

/** River centreline (flat: y must be 0). Passes through the origin, where the krathong sits. PLACEHOLDER (spec silent). */
const RIVER_CENTERLINE: readonly WorldVec3[] = [
  { x: -12, y: 0, z: 0.6 },
  { x: -6, y: 0, z: -0.3 },
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0.4 },
  { x: 12, y: 0, z: -0.5 },
];

/**
 * Visible water channel. Width 3.2 → 4.8 (×1.5) in MFW-49 so the river is clearly the main feature of the view.
 * DRAFT: the owner approves the width from the MFW-49 PR screenshots (open question 38).
 */
export const LOY_KRATHONG_RIVER_CHANNEL = { controlPoints: RIVER_CENTERLINE, width: 4.8 } as const;

/** The river's only lane id (spec §4.1 "laneId … เช่น 1"). Lead design (open question 21). */
export const LOY_KRATHONG_RIVER_LANE_ID = 1;

/**
 * Width of the single wide lane (world units); lateralOffset ±0.5 ↔ ±width/2. Lead design (open question 21), widened
 * 2.4 → 3.0 (×1.25) in MFW-49. DRAFT: the owner approves the width from the MFW-49 PR screenshots (open question 38).
 * - It is the widest lane that keeps RIVER_COLLISION_CURVATURE_MARGIN (1.1) valid on the bends: with lane 3.2 or more the
 *   inner-bend world spacing drops below 2 × RIVER_COLLISION_RADIUS (lead probe: 3.0 → 0.5752 ≥ 0.5720 pass;
 *   3.2 → 0.5708 fail; 3.6 → 0.5619 fail).
 * - The pier tip (channel half-width − overWaterLength = 2.4 − 0.6 = 1.8) stays outside the lane edge (1.5), and the lane
 *   stays inside LOY_KRATHONG_RIVER_CHANNEL (half-width 2.4).
 * - The centreline is unchanged, so progress and along-spacing of every stored SplinePathCoord keep their meaning.
 */
export const LOY_KRATHONG_RIVER_LANE_WIDTH = 3.0;

/**
 * River lanes (spec §4.1). Owner decision 21: ONE single wide lane; krathongs spread across it by lateralOffset.
 * Values owned by MFW-24; name/type shared with MFW-27. Follows the channel centreline in xz, at the water surface in y
 * (the krathong model origin, its base centre, floats on the water). Flow runs from the first control point to the last
 * (+x): progress 0 = upstream end, 1 = downstream end; the % 1 wrap happens off-screen (open question 22).
 * Guarded by riverLayout.test.ts (MFW-27) and loyKrathong.river.lanes.test.ts (MFW-24).
 */
export const LOY_KRATHONG_RIVER_LANES: readonly RiverLaneDefinition[] = Object.freeze([
  Object.freeze({
    laneId: LOY_KRATHONG_RIVER_LANE_ID,
    width: LOY_KRATHONG_RIVER_LANE_WIDTH,
    controlPoints: Object.freeze(
      RIVER_CENTERLINE.map((p) => Object.freeze({ x: p.x, y: RIVER_WATER_SURFACE_Y, z: p.z })),
    ),
  }),
]);

/**
 * Pier (ท่าน้ำ) on the near bank. PLACEHOLDER (spec silent). overWaterLength 0.35 → 0.6 and releaseInset 0.3 → 0.35 in
 * MFW-49 (the pier reaches into the wider river): DRAFT, the owner approves from the MFW-49 PR screenshots (open question 38).
 */
export const LOY_KRATHONG_PIER = {
  progress: 0.4,
  side: 1,
  onBankLength: 0.5,
  overWaterLength: 0.6,
  width: 0.5,
  deckThickness: 0.06,
  deckTopY: -0.1,
  pileBottomY: -0.34,
  releaseInset: 0.35,
  pileAlongFractions: [0.5, 1],
} as const;

/**
 * Lane location of the pier release point (LOY_KRATHONG_RIVER_LAYOUT.pier.releasePoint), clamped to the krathong body limit
 * (riverSpotLateralLimit). Three-free (MFW-23). Valid because the single lane shares the channel
 * centreline in xz, so the pier's channel progress is its lane progress. Pinned by loyKrathong.river.release.test.ts.
 */
const PIER_RELEASE_LATERAL_OFFSET =
  (LOY_KRATHONG_PIER.side *
    (LOY_KRATHONG_RIVER_CHANNEL.width / 2 - LOY_KRATHONG_PIER.overWaterLength - LOY_KRATHONG_PIER.releaseInset)) /
  LOY_KRATHONG_RIVER_LANE_WIDTH;
const KRATHONG_LATERAL_LIMIT = SPLINE_LATERAL_OFFSET_LIMIT - RIVER_COLLISION_RADIUS / LOY_KRATHONG_RIVER_LANE_WIDTH;

export const LOY_KRATHONG_PIER_RELEASE_SPOT = Object.freeze({
  laneId: LOY_KRATHONG_RIVER_LANE_ID,
  progress: LOY_KRATHONG_PIER.progress,
  lateralOffset: Math.min(KRATHONG_LATERAL_LIMIT, Math.max(-KRATHONG_LATERAL_LIMIT, PIER_RELEASE_LATERAL_OFFSET)),
});
