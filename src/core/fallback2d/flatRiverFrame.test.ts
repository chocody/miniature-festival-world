// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FLAT_RIVER_VIEW_HEIGHT_PX } from "@/config/fallback2d.config";
import { LOY_KRATHONG_RIVER_LANES, LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import {
  createRiverLane,
  currentProgress,
  type RiverLaneDefinition,
  type SplinePathCoord,
} from "@/core/coordinates";
import {
  LATERAL_SAMPLES,
  LOOP_LANE_DEF,
  PROGRESS_SAMPLES,
  STRAIGHT_LANE_DEF,
  S_LANE_DEF,
  VIEWPORTS,
} from "@/core/coordinates/__fixtures__/riverLanes";
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import { createFlatLane } from "./flatLane";
import {
  createFlatCanvasScratch,
  createFlatRiverProjection,
  flatCoordToCanvasInto,
  flatProgressToCanvasInto,
  flatRiverScrollLeft,
} from "./flatRiverFrame";
import { getLoyKrathongFlatRiver } from "./loyKrathongFlatRiver";
import {
  canvasToSplineLocation,
  createCanvasPointOut,
  createLaneSetProjection,
  getRiverItemCanvasPositionAt,
  splineCoordToCanvasInto,
} from "./riverTopDown";
import { createSplinePoseOut, createRiverLaneSet } from "@/core/coordinates";

const DEFS: readonly RiverLaneDefinition[] = [STRAIGHT_LANE_DEF, S_LANE_DEF, LOOP_LANE_DEF, LOY_KRATHONG_RIVER_LANES[0]];
const TIMES: readonly (readonly [number, number])[] = [[0, 0], [1_000, 61_000], [5_000, 1_000], [1_700_000_000_000, 1_700_000_123_456]];

describe("flat canvas point = MFW-24 canvas point (invariant B)", () => {
  it("is bit-identical for every lane fixture, viewport and sample", () => {
    for (const def of DEFS) {
      const ref = createRiverLane(def);
      const flat = createFlatLane(def);
      const set = createRiverLaneSet([def]);
      for (const vp of VIEWPORTS) {
        const projection = createLaneSetProjection(set, vp);
        const a = createCanvasPointOut();
        const b = createCanvasPointOut();
        const scratch = createFlatCanvasScratch();
        const pose = createSplinePoseOut();
        for (const spawnProgress of PROGRESS_SAMPLES) {
          for (const lateralOffset of LATERAL_SAMPLES) {
            const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: def.laneId, spawnProgress, speedFactor: 0.008, lateralOffset };
            for (const [created, now] of TIMES) {
              flatCoordToCanvasInto(coord, flat, created, now, projection, a, scratch);
              splineCoordToCanvasInto(coord, ref, created, now, projection, b, pose);
              expect(a.x).toBe(b.x);
              expect(a.y).toBe(b.y);
            }
          }
        }
      }
    }
  });

  it("matches getRiverItemCanvasPositionAt on the product lane", () => {
    const { lanes, projection } = getLoyKrathongFlatRiver();
    const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
    const out = createCanvasPointOut();
    const scratch = createFlatCanvasScratch();
    const coord: SplinePathCoord = {
      mode: "SPLINE_PATH",
      laneId: LOY_KRATHONG_RIVER_LANE_ID,
      spawnProgress: 0.42,
      speedFactor: 0.008,
      lateralOffset: 0.1,
    };
    const item = { coord, createdAtMs: 1_000 };
    for (const now of [1_000, 45_000, 99_999]) {
      const expected = getRiverItemCanvasPositionAt(item, getLoyKrathongRiverLanes(), now, projection)!;
      flatCoordToCanvasInto(coord, lane, item.createdAtMs, now, projection, out, scratch);
      expect(out.x).toBe(expected.x);
      expect(out.y).toBe(expected.y);
    }
  });

  it("round-trips coord → 2D → coord within 1e-6", () => {
    const def = LOY_KRATHONG_RIVER_LANES[0];
    const flat = createFlatLane(def);
    const ref = createRiverLane(def);
    const { projection } = getLoyKrathongFlatRiver();
    const out = createCanvasPointOut();
    const scratch = createFlatCanvasScratch();
    for (const spawnProgress of [0.05, 0.2, 0.5, 0.8, 0.95]) {
      for (const lateralOffset of [-0.45, 0, 0.45]) {
        const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: def.laneId, spawnProgress, speedFactor: 0, lateralOffset };
        flatCoordToCanvasInto(coord, flat, 0, 0, projection, out, scratch);
        const loc = canvasToSplineLocation({ x: out.x, y: out.y }, ref, projection);
        expect(Math.abs(loc.progress - currentProgress(coord, 0, 0))).toBeLessThan(1e-6);
        expect(Math.abs(loc.lateralOffset - lateralOffset)).toBeLessThan(1e-6);
      }
    }
  });

  it("flatProgressToCanvasInto equals the coord twin with zero speed", () => {
    const def = LOY_KRATHONG_RIVER_LANES[0];
    const flat = createFlatLane(def);
    const { projection } = getLoyKrathongFlatRiver();
    const a = createCanvasPointOut();
    const b = createCanvasPointOut();
    const scratch = createFlatCanvasScratch();
    const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: def.laneId, spawnProgress: 0.4, speedFactor: 0, lateralOffset: 0.2 };
    flatProgressToCanvasInto(flat, 0.4, 0.2, projection, a, scratch);
    flatCoordToCanvasInto(coord, flat, 0, 0, projection, b, scratch);
    expect(a).toEqual(b);
  });
});

describe("createFlatRiverProjection", () => {
  it("fits the height and derives the width", () => {
    const { projection, scene } = getLoyKrathongFlatRiver();
    const spanX = scene.bounds.maxX - scene.bounds.minX;
    const spanZ = scene.bounds.maxZ - scene.bounds.minZ;
    expect(projection.viewport.height).toBe(FLAT_RIVER_VIEW_HEIGHT_PX);
    expect(projection.scale).toBeCloseTo(FLAT_RIVER_VIEW_HEIGHT_PX / spanZ, 12);
    expect(Number.isInteger(projection.viewport.width)).toBe(true);
    expect(projection.viewport.width).toBeGreaterThanOrEqual(spanX * projection.scale);
  });

  it("rejects bad height and zero span", () => {
    const b = { minX: 0, maxX: 10, minZ: 0, maxZ: 5 };
    expect(() => createFlatRiverProjection(b, 0, 0)).toThrow(RangeError);
    expect(() => createFlatRiverProjection({ ...b, maxX: 0 }, 100, 0)).toThrow(RangeError);
    expect(() => createFlatRiverProjection({ ...b, maxZ: 0 }, 100, 0)).toThrow(RangeError);
  });
});

describe("flatRiverScrollLeft", () => {
  it.each([
    [500, 360, 1000, 320],
    [100, 360, 1000, 0],
    [990, 360, 1000, 640],
    [50, 360, 200, 0],
    [NaN, 360, 1000, 0],
  ])("(%s, %s, %s) → %s", (x, vw, cw, expected) => {
    expect(flatRiverScrollLeft(x, vw, cw)).toBe(expected);
  });
});
