// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createRiverLane,
  isPersistableCoord,
  splineCoordFromLocation,
  splineCoordToWorld,
  splineProgressToWorld,
  type RiverLane,
  type SplinePathCoord,
} from "@/core/coordinates";
import {
  LATERAL_SAMPLES,
  LOOP_LANE_DEF,
  PROGRESS_SAMPLES,
  STRAIGHT_LANE_DEF,
  S_LANE_DEF,
  TOLERANCE,
  VIEWPORTS,
  circularDistance,
} from "@/core/coordinates/__fixtures__/riverLanes";
import {
  canvasToSplineLocation,
  canvasToWorldXZ,
  computeLaneBoundsXZ,
  createTopDownProjection,
  splineCoordToCanvas,
  worldToCanvas,
} from "./index";

const T0 = 1_700_000_000_000;
const straight = createRiverLane(STRAIGHT_LANE_DEF);
const sLane = createRiverLane(S_LANE_DEF);
const loop = createRiverLane(LOOP_LANE_DEF);
const LANE_SETS: [string, RiverLane[]][] = [
  ["straight", [straight]],
  ["S", [sLane]],
  ["loop", [loop]],
  ["all", [straight, sLane, loop]],
];

describe.each(VIEWPORTS)("viewport %o", (viewport) => {
  describe.each(LANE_SETS)("%s lanes", (_name, lanes) => {
    const bounds = computeLaneBoundsXZ(lanes);
    const proj = createTopDownProjection(bounds, viewport);

    it("fits every grid position inside the padded viewport", () => {
      const slack = TOLERANCE.boundsPx;
      const { width, height, paddingPx: p } = viewport;
      for (const lane of lanes) {
        for (const prog of PROGRESS_SAMPLES) {
          for (const lat of LATERAL_SAMPLES) {
            const c = worldToCanvas(splineProgressToWorld(lane, prog, lat).position, proj);
            expect(c.x).toBeGreaterThanOrEqual(p - slack);
            expect(c.x).toBeLessThanOrEqual(width - p + slack);
            expect(c.y).toBeGreaterThanOrEqual(p - slack);
            expect(c.y).toBeLessThanOrEqual(height - p + slack);
          }
        }
      }
    });

    it("scales uniformly and centers the bounds", () => {
      const a = { x: 1, z: 2 };
      const b = { x: 11, z: -7 };
      const ca = worldToCanvas(a, proj);
      const cb = worldToCanvas(b, proj);
      expect(Math.hypot(cb.x - ca.x, cb.y - ca.y)).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z) * proj.scale, 9);
      const mid = worldToCanvas(
        { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
        proj,
      );
      expect(Math.abs(mid.x - viewport.width / 2)).toBeLessThan(1e-9);
      expect(Math.abs(mid.y - viewport.height / 2)).toBeLessThan(1e-9);
    });

    it("canvas <-> world is an identity round trip", () => {
      const p = { x: 12.5, z: -3.25 };
      const back = canvasToWorldXZ(worldToCanvas(p, proj), proj);
      expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(TOLERANCE.worldUnits);
      expect(Math.abs(back.z - p.z)).toBeLessThanOrEqual(TOLERANCE.worldUnits);
      const c = { x: 123.4, y: 56.7 };
      const cb = worldToCanvas(canvasToWorldXZ(c, proj), proj);
      expect(Math.abs(cb.x - c.x)).toBeLessThanOrEqual(TOLERANCE.canvasPx);
      expect(Math.abs(cb.y - c.y)).toBeLessThanOrEqual(TOLERANCE.canvasPx);
    });

    it("3D and 2D agree and the full AC3 chain returns the original coord", () => {
      for (const lane of lanes) {
        for (const spawn of PROGRESS_SAMPLES) {
          for (const lat of LATERAL_SAMPLES) {
            const speed = 0.008;
            const dt = 12_345;
            const coord: SplinePathCoord = {
              mode: "SPLINE_PATH",
              laneId: lane.laneId,
              spawnProgress: spawn,
              speedFactor: speed,
              lateralOffset: lat,
            };
            const world = splineCoordToWorld(coord, lane, T0, T0 + dt);
            const canvas = splineCoordToCanvas(coord, lane, T0, T0 + dt, proj);
            expect(canvas).toEqual(worldToCanvas(world.position, proj));

            const loc = canvasToSplineLocation(canvas, lane, proj);
            const back = splineCoordFromLocation(loc, lane.laneId, speed, T0, T0 + dt);
            expect(circularDistance(back.spawnProgress, spawn)).toBeLessThanOrEqual(TOLERANCE.progress);
            expect(Math.abs(back.lateralOffset - lat)).toBeLessThanOrEqual(TOLERANCE.lateral);
            expect(back.laneId).toBe(coord.laneId);
            expect(back.speedFactor).toBe(speed);
            expect(isPersistableCoord(back)).toBe(true);
          }
        }
      }
    });
  });
});

describe("orientation (straight lane)", () => {
  const proj = createTopDownProjection(computeLaneBoundsXZ([straight]), VIEWPORTS[1]);
  it("increasing progress increases canvas x", () => {
    const a = worldToCanvas(splineProgressToWorld(straight, 0.2, 0).position, proj);
    const b = worldToCanvas(splineProgressToWorld(straight, 0.6, 0).position, proj);
    expect(b.x).toBeGreaterThan(a.x);
  });
  it("+lateral increases canvas y", () => {
    const a = worldToCanvas(splineProgressToWorld(straight, 0.5, 0).position, proj);
    const b = worldToCanvas(splineProgressToWorld(straight, 0.5, 0.4).position, proj);
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe("validation", () => {
  const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
  it("createTopDownProjection throws RangeError on bad input", () => {
    expect(() => createTopDownProjection(bounds, { width: 0, height: 100, paddingPx: 0 })).toThrow(RangeError);
    expect(() => createTopDownProjection(bounds, { width: 100, height: 100, paddingPx: 50 })).toThrow(RangeError);
    expect(() =>
      createTopDownProjection({ ...bounds, minX: NaN }, { width: 100, height: 100, paddingPx: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createTopDownProjection({ minX: 1, maxX: 1, minZ: 2, maxZ: 2 }, { width: 100, height: 100, paddingPx: 0 }),
    ).toThrow(RangeError);
  });
  it("computeLaneBoundsXZ throws on no lanes", () => {
    expect(() => computeLaneBoundsXZ([])).toThrow(RangeError);
  });
});
