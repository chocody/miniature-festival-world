// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOY_KRATHONG_RIVER_CHANNEL,
  LOY_KRATHONG_RIVER_LANES,
  LOY_KRATHONG_RIVER_LANE_ID,
  LOY_KRATHONG_RIVER_LANE_WIDTH,
  LOY_KRATHONG_PIER,
  LOY_KRATHONG_PIER_RELEASE_SPOT,
  RIVER_WATER_SURFACE_Y,
} from "./loyKrathong.river.config";
import { RIVER_COLLISION_RADIUS, RIVER_MIN_CENTER_SPACING } from "@/config/riverFlow.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import {
  createRiverChannel,
  findNearestFreeSpot,
  resolvePierLayout,
  riverCoordFromSpot,
  riverSpotDistance,
  riverSpotLateralLimit,
  riverSpotOf,
} from "@/core/world";
import {
  createRiverLane,
  createRiverLaneSet,
  isPersistableCoord,
  locateOnLane,
  splineCoordFromLocation,
  splineProgressToWorld,
  type RiverLaneSet,
  type RiverPlacementSource,
} from "@/core/coordinates";
import {
  LATERAL_SAMPLES,
  PROGRESS_SAMPLES,
  TOLERANCE,
  VIEWPORTS,
  circularDistance,
} from "@/core/coordinates/__fixtures__/riverLanes";
import { canvasToSplineLocation, createLaneSetProjection, splineCoordToCanvas } from "@/core/fallback2d";

const TURN_SAMPLES = 2000;
const EDGE_SAMPLES = 64;
const HALF = 0.5;
const lane = createRiverLane(LOY_KRATHONG_RIVER_LANES[0]);

describe("Loy Krathong river lane (open question 21)", () => {
  it("is exactly one lane with the product id and width", () => {
    expect(LOY_KRATHONG_RIVER_LANES).toHaveLength(1);
    expect(LOY_KRATHONG_RIVER_LANES[0].laneId).toBe(LOY_KRATHONG_RIVER_LANE_ID);
    expect(LOY_KRATHONG_RIVER_LANE_ID).toBe(1);
    expect(LOY_KRATHONG_RIVER_LANES[0].width).toBe(LOY_KRATHONG_RIVER_LANE_WIDTH);
  });

  it("follows the channel centreline at the water surface and is frozen", () => {
    const def = LOY_KRATHONG_RIVER_LANES[0];
    const channelPoints = LOY_KRATHONG_RIVER_CHANNEL.controlPoints;
    expect(def.controlPoints).toHaveLength(channelPoints.length);
    def.controlPoints.forEach((p, i) => {
      expect(p.x).toBe(channelPoints[i].x);
      expect(p.z).toBe(channelPoints[i].z);
      expect(p.y).toBe(RIVER_WATER_SURFACE_Y);
      expect(Object.isFrozen(p)).toBe(true);
    });
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.controlPoints)).toBe(true);
    expect(Object.isFrozen(LOY_KRATHONG_RIVER_LANES)).toBe(true);
  });

  it("builds a lane set", () => {
    expect(() => createRiverLaneSet(LOY_KRATHONG_RIVER_LANES)).not.toThrow();
  });

  it("turns more gently than half the lane width", () => {
    let minRadius = Infinity;
    const pts = Array.from({ length: TURN_SAMPLES + 1 }, (_, i) => lane.curve.getPointAt(i / TURN_SAMPLES));
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const bc = Math.hypot(c.x - b.x, c.z - b.z);
      const ca = Math.hypot(a.x - c.x, a.z - c.z);
      const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      if (cross > 0) minRadius = Math.min(minRadius, (ab * bc * ca) / (2 * cross));
    }
    expect(minRadius).toBeGreaterThan(lane.width / 2);
  });

  it("keeps both lane edges inside the channel", () => {
    const channel = createRiverLane({
      laneId: 0,
      controlPoints: LOY_KRATHONG_RIVER_CHANNEL.controlPoints,
      width: LOY_KRATHONG_RIVER_CHANNEL.width,
    });
    for (let i = 0; i <= EDGE_SAMPLES; i++) {
      const p = splineProgressToWorld(lane, i / EDGE_SAMPLES, 0);
      for (const sign of [-1, 1]) {
        const d = (sign * lane.width) / 2;
        const edge = { x: p.centerline.x + p.right.x * d, z: p.centerline.z + p.right.z * d };
        expect(Math.abs(locateOnLane(channel, edge).lateralOffset)).toBeLessThanOrEqual(HALF + 1e-9);
      }
    }
  });

  it("round-trips parametric -> 3D -> parametric", () => {
    for (const progress of PROGRESS_SAMPLES) {
      for (const lateral of LATERAL_SAMPLES) {
        const w = splineProgressToWorld(lane, progress, lateral);
        const back = locateOnLane(lane, w.position);
        expect(circularDistance(back.progress, progress)).toBeLessThanOrEqual(TOLERANCE.progress);
        expect(Math.abs(back.lateralOffset - lateral)).toBeLessThanOrEqual(TOLERANCE.lateral);
      }
    }
  });

  it("round-trips parametric -> 2D -> coord (invariant B)", () => {
    const set = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
    const T0 = 1_700_000_000_000;
    for (const viewport of VIEWPORTS) {
      const projection = createLaneSetProjection(set, viewport);
      for (const progress of PROGRESS_SAMPLES) {
        for (const lateral of LATERAL_SAMPLES) {
          const coord = splineCoordFromLocation({ progress, lateralOffset: lateral }, 1, 0.008, T0, T0);
          const canvas = splineCoordToCanvas(coord, lane, T0, T0, projection);
          const loc = canvasToSplineLocation(canvas, lane, projection);
          const back = splineCoordFromLocation(loc, 1, 0.008, T0, T0);
          expect(circularDistance(back.spawnProgress, coord.spawnProgress)).toBeLessThanOrEqual(TOLERANCE.progress);
          expect(Math.abs(back.lateralOffset - lateral)).toBeLessThanOrEqual(TOLERANCE.lateral);
          expect(isPersistableCoord(back)).toBe(true);
        }
      }
    }
  });

  it("the lane config stays server-safe (no three / react)", () => {
    const text = readFileSync("src/config/events/loyKrathong.river.config.ts", "utf8");
    expect(text).not.toMatch(/from "three"/);
    expect(text).not.toMatch(/@react-three/);
    expect(text).not.toMatch(/from "react"/);
  });
});

describe("wider river, same stored coords (MFW-49, open question 38)", () => {
  /** MFW-24 shipped width (test-only literal): the v1 lane every stored coord was placed on. */
  const V1_LANE_WIDTH = 2.4;
  const V1_CHANNEL_WIDTH = 3.2;
  const V1_CONTROL_POINTS = [
    { x: -12, z: 0.6 },
    { x: -6, z: -0.3 },
    { x: 0, z: 0 },
    { x: 6, z: 0.4 },
    { x: 12, z: -0.5 },
  ];
  const CREATED = 1_700_000_000_000;
  const newLanes = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES);
  const newLane = newLanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
  const channel = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL);

  function greedyFill(lanes: RiverLaneSet): RiverPlacementSource[] {
    const items: RiverPlacementSource[] = [];
    const release = { laneId: LOY_KRATHONG_RIVER_LANE_ID, progress: 0.4, lateralOffset: 0.38 };
    for (;;) {
      const s = findNearestFreeSpot(release, items, lanes, CREATED);
      if (s === null) break;
      items.push({ coord: riverCoordFromSpot(s, CREATED), createdAtMs: CREATED });
      expect(items.length).toBeLessThan(1000);
    }
    return items;
  }

  it("L1: the channel and the lane are wider than v1", () => {
    expect(LOY_KRATHONG_RIVER_CHANNEL.width).toBeGreaterThan(V1_CHANNEL_WIDTH);
    expect(LOY_KRATHONG_RIVER_LANE_WIDTH).toBeGreaterThan(V1_LANE_WIDTH);
  });

  it("L2: the centreline control points are the v1 points", () => {
    expect(LOY_KRATHONG_RIVER_CHANNEL.controlPoints.map((p) => ({ x: p.x, z: p.z }))).toEqual(V1_CONTROL_POINTS);
    expect(LOY_KRATHONG_RIVER_LANES[0].controlPoints.map((p) => ({ x: p.x, z: p.z }))).toEqual(V1_CONTROL_POINTS);
  });

  it("L3: the zone cap stays 80", () => {
    expect(ZONE_ITEM_CAP).toBe(80);
  });

  it("L4: a full v1 zone stays valid and collision-free on the wider lane", { timeout: 30_000 }, () => {
    const v1 = createRiverLaneSet(LOY_KRATHONG_RIVER_LANES.map((d) => ({ ...d, width: V1_LANE_WIDTH })));
    const items = greedyFill(v1);
    expect(items.length).toBeGreaterThanOrEqual(ZONE_ITEM_CAP);
    const limit = riverSpotLateralLimit(newLane);
    const spots = items.map((i) => riverSpotOf(i, newLanes, CREATED)!);
    const world = spots.map((s) => splineProgressToWorld(newLane, s.progress, s.lateralOffset).position);
    items.forEach((item, i) => {
      expect(isPersistableCoord(item.coord)).toBe(true);
      expect(Math.abs(item.coord.lateralOffset)).toBeLessThanOrEqual(limit);
      expect(Math.abs(locateOnLane(channel, world[i]).lateralOffset)).toBeLessThanOrEqual(HALF + 1e-9);
    });
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(riverSpotDistance(spots[i], spots[j], newLane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING - 1e-9);
        expect(Math.hypot(world[i].x - world[j].x, world[i].z - world[j].z)).toBeGreaterThanOrEqual(2 * RIVER_COLLISION_RADIUS);
      }
    }
  });

  it("L5: a full zone fits on the new lane", { timeout: 30_000 }, () => {
    expect(greedyFill(newLanes).length).toBeGreaterThanOrEqual(ZONE_ITEM_CAP);
  });

  it("L6: the pier tip stays outside the lane and the release point is on it", () => {
    const pier = resolvePierLayout(channel, LOY_KRATHONG_PIER, RIVER_WATER_SURFACE_Y);
    const tip = locateOnLane(newLane, pier.tip);
    expect(Math.abs(tip.lateralOffset) * newLane.width).toBeGreaterThan(newLane.width / 2);
    const release = locateOnLane(newLane, pier.releasePoint);
    expect(Math.abs(release.lateralOffset)).toBeLessThanOrEqual(HALF);
    expect(Math.abs(LOY_KRATHONG_PIER_RELEASE_SPOT.lateralOffset)).toBeLessThanOrEqual(riverSpotLateralLimit(newLane));
  });
});
