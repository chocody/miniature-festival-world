import { describe, expect, it } from "vitest";
import { parsePersistableCoord } from "@/core/coordinates";
import { riverCoordFromSpot } from "@/core/world";
import { buildReleaseCoord, didServerMoveSpot, isSplinePathCoordShape } from "./releaseCoord";

const SPOTS = [
  { laneId: 1, progress: 0.4, lateralOffset: 0.38 },
  { laneId: 1, progress: 0.999, lateralOffset: -0.2 },
  { laneId: 1, progress: 0.25, lateralOffset: 0 },
];

describe("buildReleaseCoord", () => {
  it.each(SPOTS)("equals riverCoordFromSpot for %j", (spot) => {
    for (const t of [0, 1_700_000_000_000]) {
      expect(buildReleaseCoord(spot)).toStrictEqual(riverCoordFromSpot(spot, t));
    }
    const coord = buildReleaseCoord(spot);
    expect(parsePersistableCoord(coord).ok).toBe(true);
    expect(Object.keys(coord)).toHaveLength(5);
  });

  it("wraps progress and clamps lateral", () => {
    expect(buildReleaseCoord({ laneId: 1, progress: 1.25, lateralOffset: 0 }).spawnProgress).toBeCloseTo(0.25, 12);
    expect(buildReleaseCoord({ laneId: 1, progress: -0.1, lateralOffset: 0.6 })).toMatchObject({ lateralOffset: 0.5 });
    expect(buildReleaseCoord({ laneId: 1, progress: -0.1, lateralOffset: 0.6 }).spawnProgress).toBeCloseTo(0.9, 12);
  });

  it("rejects non-integer lanes and non-finite numbers", () => {
    expect(() => buildReleaseCoord({ laneId: 1.5, progress: 0, lateralOffset: 0 })).toThrow(RangeError);
    expect(() => buildReleaseCoord({ laneId: 1, progress: NaN, lateralOffset: 0 })).toThrow(RangeError);
    expect(() => buildReleaseCoord({ laneId: 1, progress: 0, lateralOffset: Infinity })).toThrow(RangeError);
  });
});

describe("isSplinePathCoordShape", () => {
  const ok = buildReleaseCoord(SPOTS[0]);
  it("accepts a valid coord and rejects bad shapes", () => {
    expect(isSplinePathCoordShape(ok)).toBe(true);
    expect(isSplinePathCoordShape({ ...ok, x: 0 })).toBe(false);
    expect(isSplinePathCoordShape({ ...ok, mode: "CYLINDRICAL_SURFACE" })).toBe(false);
    expect(isSplinePathCoordShape({ ...ok, spawnProgress: 1.2 })).toBe(false);
    expect(isSplinePathCoordShape([ok])).toBe(false);
    expect(isSplinePathCoordShape(null)).toBe(false);
  });
});

describe("didServerMoveSpot", () => {
  const sent = buildReleaseCoord({ laneId: 1, progress: 0, lateralOffset: 0 });
  it("detects moves beyond the epsilon, circularly", () => {
    expect(didServerMoveSpot(sent, { ...sent })).toBe(false);
    expect(didServerMoveSpot(sent, { ...sent, spawnProgress: 0.9999999999999 })).toBe(false);
    expect(didServerMoveSpot(sent, { ...sent, lateralOffset: 0.2 })).toBe(true);
    expect(didServerMoveSpot(sent, { ...sent, laneId: 2 })).toBe(true);
    expect(didServerMoveSpot(sent, { ...sent, spawnProgress: 0.1 })).toBe(true);
  });
});
