// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_CHANNEL, LOY_KRATHONG_RIVER_LANES } from "@/config/events/loyKrathong.river.config";
import { createRiverChannel } from "@/core/world/riverEnvironment";
import {
  acrossOf,
  alongOf,
  createEndlessRiverFrame,
  frameToWorldInto,
  stretchIndexAt,
  stretchIndexWithHysteresis,
  stretchOffsetInto,
} from "./endlessRiverFrame";
import { createRiverLane, splineProgressToWorld, type RiverLane } from "./SplinePathCoord";

const FRAME = createEndlessRiverFrame(LOY_KRATHONG_RIVER_CHANNEL.controlPoints);
const L = FRAME.length;
const at = (along: number, across = 0) => frameToWorldInto(FRAME, along, across, { x: 0, z: 0 });
/** Round-trip tolerance (world units) of along/across ↔ xz: float64 arithmetic on values ≤ 1e3. */
const XZ_TOLERANCE = 1e-9;

describe("endless river frame (MFW-58, three-free)", () => {
  it("is the Loy Krathong centreline's period: T = last − first, L ≈ 24.0252, unit axis", () => {
    expect(FRAME.originX).toBe(-12);
    expect(FRAME.originZ).toBe(0.6);
    expect(FRAME.periodX).toBe(24);
    expect(FRAME.periodZ).toBeCloseTo(-1.1, 12);
    expect(L).toBeCloseTo(24.0252, 4);
    expect(Math.hypot(FRAME.axisX, FRAME.axisZ)).toBeCloseTo(1, 12);
    expect(Object.isFrozen(FRAME)).toBe(true);
  });

  it("indexes stretches by the along coordinate", () => {
    expect(stretchIndexAt(FRAME, FRAME.originX, FRAME.originZ)).toBe(0);
    const nearlyT = 1 - 1e-9;
    expect(stretchIndexAt(FRAME, FRAME.originX + FRAME.periodX * nearlyT, FRAME.originZ + FRAME.periodZ * nearlyT)).toBe(0);
    expect(stretchIndexAt(FRAME, FRAME.originX + FRAME.periodX, FRAME.originZ + FRAME.periodZ)).toBe(1);
    expect(stretchIndexAt(FRAME, FRAME.originX - FRAME.periodX * 0.5, FRAME.originZ - FRAME.periodZ * 0.5)).toBe(-1);
    expect(stretchIndexAt(FRAME, 0, 0)).toBe(0); // the pier / ritual site stays in stretch 0
  });

  it("keeps the current stretch within the hysteresis band around its seams", () => {
    const h = 1;
    const w = (along: number) => at(along);
    const s = (along: number, current = 0) => stretchIndexWithHysteresis(FRAME, w(along).x, w(along).z, current, h);
    expect(s(L + 0.5 * h)).toBe(0);
    expect(s(L + 1.5 * h)).toBe(1);
    expect(s(-0.5 * h)).toBe(0);
    expect(s(-1.5 * h)).toBe(-1);
    expect(s(L - 0.5 * h, 1)).toBe(1); // coming back: stays 1 until the focus is h past the seam
    expect(s(L - 1.5 * h, 1)).toBe(0);
    expect(s(5 * L + 3, 0)).toBe(5); // a jump far away re-indexes directly
  });

  it("round-trips along/across ↔ xz within 1e-9", () => {
    for (const along of [-1000, -L, -3.3, 0, 7.25, L, 3 * L + 0.1, 500]) {
      for (const across of [-30, -2.4, 0, 1.1, 30]) {
        const p = at(along, across);
        expect(Math.abs(alongOf(FRAME, p.x, p.z) - along)).toBeLessThan(XZ_TOLERANCE);
        expect(Math.abs(acrossOf(FRAME, p.x, p.z) - across)).toBeLessThan(XZ_TOLERANCE);
      }
    }
  });

  it("writes stretch offsets s·T", () => {
    const out = { x: 9, z: 9 };
    expect(stretchOffsetInto(FRAME, 0, out)).toEqual({ x: 0, z: -0 });
    expect(stretchOffsetInto(FRAME, -3, out)).toEqual({ x: -72, z: -3 * FRAME.periodZ });
    expect(stretchOffsetInto(FRAME, 2, out)).toBe(out);
  });

  it("rejects bad input with RangeError", () => {
    expect(() => createEndlessRiverFrame([{ x: 0, z: 0 }])).toThrow(RangeError);
    expect(() => createEndlessRiverFrame([{ x: 0, z: 0 }, { x: 0, z: 0 }])).toThrow(RangeError);
    expect(() => createEndlessRiverFrame([{ x: 0, z: 0 }, { x: Number.NaN, z: 1 }])).toThrow(RangeError);
    expect(() => stretchIndexAt(FRAME, Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
    expect(() => stretchIndexWithHysteresis(FRAME, 0, 0, 0.5, 1)).toThrow(RangeError);
    expect(() => stretchIndexWithHysteresis(FRAME, 0, 0, 0, L / 2)).toThrow(RangeError);
    expect(() => stretchIndexWithHysteresis(FRAME, 0, 0, 0, -1)).toThrow(RangeError);
    expect(() => stretchIndexWithHysteresis(FRAME, Number.NaN, 0, 0, 1)).toThrow(RangeError);
    expect(() => stretchOffsetInto(FRAME, 1.5, { x: 0, z: 0 })).toThrow(RangeError);
  });

  describe("config guard: the river joins itself C1 under the translation T", () => {
    const lane = createRiverLane(LOY_KRATHONG_RIVER_LANES[0]);
    const channel = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL);
    const yawOf = (l: RiverLane, u: number) => splineProgressToWorld(l, u, 0).yawRad;
    /** Tangent direction tolerance at the seam (radians). Lead probe: 1.9e-4° ≈ 3.3e-6 rad. */
    const TANGENT_TOLERANCE_RAD = 1e-5;

    it.each([
      ["lane 1", lane],
      ["channel", channel],
    ] as const)("%s: end and start tangents are parallel within 1e-5 rad", (_name, l) => {
      const d = Math.atan2(Math.sin(yawOf(l, 1) - yawOf(l, 0)), Math.cos(yawOf(l, 1) - yawOf(l, 0)));
      expect(Math.abs(d)).toBeLessThan(TANGENT_TOLERANCE_RAD);
    });

    it("lane and channel share T in xz", () => {
      const pts = LOY_KRATHONG_RIVER_LANES[0].controlPoints;
      const laneFrame = createEndlessRiverFrame(pts);
      expect(laneFrame.periodX).toBe(FRAME.periodX);
      expect(laneFrame.periodZ).toBe(FRAME.periodZ);
      expect(laneFrame.originX).toBe(FRAME.originX);
      expect(laneFrame.originZ).toBe(FRAME.originZ);
    });
  });
});
