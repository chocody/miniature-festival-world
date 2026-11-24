// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createRiverLane,
  createRiverLaneSet,
  createSplinePoseOut,
  type RiverPlacementSource,
  type SplinePathCoord,
} from "@/core/coordinates";
import { STRAIGHT_LANE_DEF, S_LANE_DEF, VIEWPORTS } from "@/core/coordinates/__fixtures__/riverLanes";
import {
  computeLaneBoundsXZ,
  createCanvasPointOut,
  createLaneSetProjection,
  createTopDownProjection,
  getRiverItemCanvasPositionAt,
  splineCoordToCanvas,
  splineCoordToCanvasInto,
  worldToCanvas,
  worldToCanvasInto,
} from "./riverTopDown";

const T0 = 1_700_000_000_000;
const set = createRiverLaneSet([STRAIGHT_LANE_DEF, S_LANE_DEF]);
const coordOn = (laneId: number): SplinePathCoord => ({
  mode: "SPLINE_PATH", laneId, spawnProgress: 0.3, speedFactor: 0.008, lateralOffset: -0.2,
});

describe("2D Into twins", () => {
  it("are bit-identical to their allocating versions and return out", () => {
    for (const vp of VIEWPORTS) {
      const projection = createLaneSetProjection(set, vp);
      for (const lane of set.lanes) {
        const out = createCanvasPointOut();
        const pose = createSplinePoseOut();
        const coord = coordOn(lane.laneId);
        const expected = splineCoordToCanvas(coord, lane, T0, T0 + 5000, projection);
        const result = splineCoordToCanvasInto(coord, lane, T0, T0 + 5000, projection, out, pose);
        expect(result).toBe(out);
        expect(out.x === expected.x).toBe(true);
        expect(out.y === expected.y).toBe(true);
        const w = worldToCanvas({ x: 3.5, z: -1.25 }, projection);
        expect(worldToCanvasInto({ x: 3.5, z: -1.25 }, projection, out)).toBe(out);
        expect(out.x === w.x && out.y === w.y).toBe(true);
      }
    }
  });

  it("createLaneSetProjection fits the lane set bounds", () => {
    for (const vp of VIEWPORTS) {
      expect(createLaneSetProjection(set, vp)).toEqual(createTopDownProjection(computeLaneBoundsXZ(set.lanes), vp));
    }
  });
});

describe("getRiverItemCanvasPositionAt", () => {
  const projection = createLaneSetProjection(set, VIEWPORTS[0]);
  it("matches splineCoordToCanvas for a valid item", () => {
    const item: RiverPlacementSource = { coord: coordOn(2), createdAtMs: T0 };
    const lane = createRiverLane(S_LANE_DEF);
    expect(getRiverItemCanvasPositionAt(item, set, T0 + 9000, projection)).toEqual(
      splineCoordToCanvas(item.coord, lane, T0, T0 + 9000, projection),
    );
  });
  it("returns null for unknown lane, invalid coord and NaN createdAt", () => {
    expect(getRiverItemCanvasPositionAt({ coord: coordOn(99), createdAtMs: T0 }, set, T0, projection)).toBeNull();
    expect(getRiverItemCanvasPositionAt({ coord: { ...coordOn(1), lateralOffset: 2 }, createdAtMs: T0 }, set, T0, projection)).toBeNull();
    expect(getRiverItemCanvasPositionAt({ coord: coordOn(1), createdAtMs: NaN }, set, T0, projection)).toBeNull();
  });
});
