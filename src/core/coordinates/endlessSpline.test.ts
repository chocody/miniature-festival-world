// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_CHANNEL, LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createEndlessRiverFrame } from "./endlessRiverFrame";
import { endlessCoordToPoseInto, endlessProgressToPoseInto, locateOnEndlessLane } from "./endlessSpline";
import { createRiverLane, createSplinePoseOut, splineProgressToPoseInto, type SplinePathCoord } from "./SplinePathCoord";
import { currentProgress } from "./splineProgress";

const LANE_DEF = LOY_KRATHONG_RIVER_LANES[0];
const lane = createRiverLane(LANE_DEF);
const frame = createEndlessRiverFrame(LOY_KRATHONG_RIVER_CHANNEL.controlPoints);
/** Round-trip tolerance of (stretch, progress, lateral) → endless world pose → located (progress and lateral, unitless). */
const LOCATE_TOLERANCE = 1e-6;
/** Seam continuity: (s, 1) vs (s + 1, 0) world distance (world units) and yaw (radians). */
const SEAM_POSITION_TOLERANCE = 1e-9;
const SEAM_YAW_TOLERANCE_RAD = 1e-5;

describe("endless lane poses (MFW-58, invariant B)", () => {
  it("stretch 0 is bit-identical to splineProgressToPoseInto", () => {
    const a = createSplinePoseOut();
    const b = createSplinePoseOut();
    for (const p of [0, 0.1, 0.4, 0.75, 1]) {
      for (const lat of [-0.5, 0, 0.3]) {
        splineProgressToPoseInto(lane, p, lat, a);
        endlessProgressToPoseInto(lane, frame, 0, p, lat, b);
        expect(b.x === a.x && b.y === a.y && b.z === a.z && b.yawRad === a.yawRad).toBe(true);
      }
    }
  });

  it("round-trips parametric ↔ endless 3D world ↔ located (same stretch, progress and lateral within 1e-6)", () => {
    const out = createSplinePoseOut();
    for (const s of [-7, -1, 0, 1, 3, 1000]) {
      for (const p of [0.001, 0.25, 0.5, 0.999]) {
        for (const lat of [-0.5, 0, 0.4]) {
          endlessProgressToPoseInto(lane, frame, s, p, lat, out);
          const loc = locateOnEndlessLane(lane, frame, { x: out.x, z: out.z });
          expect(loc.stretchIndex).toBe(s);
          expect(Math.abs(loc.progress - p)).toBeLessThan(LOCATE_TOLERANCE);
          expect(Math.abs(loc.lateralOffset - lat)).toBeLessThan(LOCATE_TOLERANCE);
        }
      }
    }
  });

  it("joins at every seam: (s, 1) and (s + 1, 0) agree in position and yaw", () => {
    const end = createSplinePoseOut();
    const start = createSplinePoseOut();
    for (const s of [-2, 0, 5]) {
      endlessProgressToPoseInto(lane, frame, s, 1, 0, end);
      endlessProgressToPoseInto(lane, frame, s + 1, 0, 0, start);
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(SEAM_POSITION_TOLERANCE);
      expect(Math.abs(end.y - start.y)).toBeLessThan(SEAM_POSITION_TOLERANCE);
      expect(Math.abs(Math.atan2(Math.sin(end.yawRad - start.yawRad), Math.cos(end.yawRad - start.yawRad)))).toBeLessThan(
        SEAM_YAW_TOLERANCE_RAD,
      );
    }
  });

  it("endlessCoordToPoseInto = CurrentProgress(t) pose + s·T, with the laneId check", () => {
    const coord: SplinePathCoord = { mode: "SPLINE_PATH", laneId: 1, spawnProgress: 0.2, speedFactor: 0.003, lateralOffset: 0.1 };
    const created = 1_700_000_000_000;
    const now = created + 95_000;
    const a = createSplinePoseOut();
    const b = createSplinePoseOut();
    endlessCoordToPoseInto(coord, lane, frame, 3, created, now, a);
    splineProgressToPoseInto(lane, currentProgress(coord, created, now), coord.lateralOffset, b);
    expect(a.x).toBe(b.x + 3 * frame.periodX);
    expect(a.z).toBe(b.z + 3 * frame.periodZ);
    expect(a.yawRad).toBe(b.yawRad);
    expect(() => endlessCoordToPoseInto({ ...coord, laneId: 7 }, lane, frame, 0, created, now, a)).toThrow(RangeError);
    expect(() => endlessProgressToPoseInto(lane, frame, 0.5, 0.2, 0, a)).toThrow(RangeError);
  });
});
