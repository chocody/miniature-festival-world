// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RIVER_COLLISION_RADIUS,
  RIVER_DRIFT_SPEED_FACTOR,
  RIVER_MIN_CENTER_SPACING,
} from "@/config/riverFlow.config";
import {
  createRiverLaneSet,
  isPersistableCoord,
  splineProgressToWorld,
  type RiverPlacementSource,
} from "@/core/coordinates";
import { STRAIGHT_LANE_DEF, S_LANE_DEF } from "@/core/coordinates/__fixtures__/riverLanes";
import {
  findNearestFreeSpot,
  isSpotFree,
  riverCoordFromSpot,
  riverSpotDistance,
  riverSpotLateralLimit,
  riverSpotOf,
  type RiverSpot,
} from "./riverCollision";
import { getLoyKrathongRiverLanes } from "./riverLanes";

const T0 = 1_700_000_000_000;
const NOW = T0 + 60_000;
const ZONE_ITEM_CAP_FOR_TEST = 80; // open question 4
const lanes = getLoyKrathongRiverLanes();
const lane = lanes.get(1)!;
const lim = riverSpotLateralLimit(lane);
const L = lane.curve.getLength();
const spot = (progress: number, lateralOffset: number, laneId = 1): RiverSpot => ({ laneId, progress, lateralOffset });
const at = (s: RiverSpot, createdAtMs: number): RiverPlacementSource => ({
  coord: riverCoordFromSpot(s, createdAtMs),
  createdAtMs,
});

describe("riverSpotLateralLimit / distance", () => {
  it("follows the formula and is 0 for a narrow lane", () => {
    expect(lim).toBe(0.5 - RIVER_COLLISION_RADIUS / lane.width);
    const narrow = createRiverLaneSet([{ ...STRAIGHT_LANE_DEF, width: RIVER_COLLISION_RADIUS }]).get(1)!;
    expect(riverSpotLateralLimit(narrow)).toBe(0);
  });

  it("is symmetric, wraps at the seam and scales laterally", () => {
    const a = spot(0.3, 0.1);
    const b = spot(0.6, -0.2);
    expect(riverSpotDistance(a, b, lane)).toBe(riverSpotDistance(b, a, lane));
    expect(riverSpotDistance(spot(0.99, 0), spot(0.01, 0), lane)).toBeCloseTo(0.02 * L, 9);
    expect(riverSpotDistance(spot(0.5, 0.25), spot(0.5, 0), lane)).toBeCloseTo(0.25 * lane.width, 12);
  });
});

describe("equal speed keeps spacing (AC2)", () => {
  it("spacing is time-invariant, also across the wrap", () => {
    const A = at(spot(0.95, 0.1), T0);
    const B = at(spot(0.1, -0.2), T0 + 7000);
    const start = T0 + 7000;
    const span = 3 * (1 / RIVER_DRIFT_SPEED_FACTOR) * 1000;
    const dist = (now: number) => riverSpotDistance(riverSpotOf(A, lanes, now)!, riverSpotOf(B, lanes, now)!, lane);
    const d0 = dist(start);
    for (let k = 0; k < 600; k++) {
      expect(Math.abs(dist(start + (k * span) / 599) - d0)).toBeLessThan(1e-9);
    }
  });

  it("world bodies never overlap at minimum spacing", () => {
    const laps = 40;
    let minWorld = Infinity;
    for (let i = 0; i < 60; i++) {
      for (const lat of [-lim, 0, lim]) {
        for (let k = 0; k < 7; k++) {
          const theta = (k * Math.PI) / 6;
          const dl = (Math.sin(theta) * RIVER_MIN_CENTER_SPACING) / lane.width;
          const lb = lat + dl;
          if (lb < -lim || lb > lim) continue;
          const dp = (Math.cos(theta) * RIVER_MIN_CENTER_SPACING) / L;
          for (let s = 0; s < laps; s++) {
            const pa = (i / 60 + s / laps) % 1;
            const pb = (((i / 60 + dp + s / laps) % 1) + 1) % 1;
            const wa = splineProgressToWorld(lane, pa, lat).position;
            const wb = splineProgressToWorld(lane, pb, lb).position;
            minWorld = Math.min(minWorld, Math.hypot(wa.x - wb.x, wa.z - wb.z));
          }
        }
      }
    }
    expect(minWorld).toBeGreaterThanOrEqual(2 * RIVER_COLLISION_RADIUS);
  });
});

describe("riverCoordFromSpot", () => {
  it("writes the shared speed and a persistable coord", () => {
    const s = spot(0.42, 0.1);
    const coord = riverCoordFromSpot(s, T0);
    expect(coord.speedFactor).toBe(RIVER_DRIFT_SPEED_FACTOR);
    expect(coord.spawnProgress).toBe(s.progress);
    expect(isPersistableCoord(coord)).toBe(true);
    expect(riverSpotOf(at(s, T0), lanes, T0)).toEqual(s);
  });
});

describe("isSpotFree", () => {
  const base = at(spot(0.5, 0), T0);
  it("handles distances, limits and invalid input", () => {
    expect(isSpotFree(spot(0.2, 0), [], lanes, NOW)).toBe(true);
    const nowBase = riverSpotOf(base, lanes, NOW)!;
    const dp = RIVER_MIN_CENTER_SPACING / L;
    expect(isSpotFree(spot(nowBase.progress + dp, 0), [base], lanes, NOW)).toBe(true);
    expect(isSpotFree(spot(nowBase.progress + dp - 1e-6 / L, 0), [base], lanes, NOW)).toBe(false);
    expect(isSpotFree(spot(0.1, lim + 1e-6), [], lanes, NOW)).toBe(false);
    expect(isSpotFree(spot(0.1, 0, 99), [], lanes, NOW)).toBe(false);
    expect(isSpotFree(spot(NaN, 0), [], lanes, NOW)).toBe(false);
    expect(isSpotFree(spot(0.1, NaN), [], lanes, NOW)).toBe(false);
  });

  it("ignores invalid rows", () => {
    const bad = { coord: { ...base.coord, x: 1 }, createdAtMs: T0 } as unknown as RiverPlacementSource;
    const nowBase = riverSpotOf(base, lanes, NOW)!;
    expect(isSpotFree(spot(nowBase.progress, 0), [bad], lanes, NOW)).toBe(true);
  });

  it("ignores items on another lane", () => {
    const two = createRiverLaneSet([STRAIGHT_LANE_DEF, S_LANE_DEF]);
    const other: RiverPlacementSource = { coord: riverCoordFromSpot(spot(0.5, 0, 2), T0), createdAtMs: T0 };
    expect(isSpotFree(spot(0.5, 0, 1), [other], two, T0)).toBe(true);
    expect(isSpotFree(spot(0.5, 0, 2), [other], two, T0)).toBe(false);
  });
});

describe("findNearestFreeSpot", () => {
  it("returns a free candidate unchanged and clamps lateral", () => {
    const s = spot(0.3, 0.1);
    expect(findNearestFreeSpot(s, [], lanes, NOW)).toEqual(s);
    expect(findNearestFreeSpot(spot(0.3, 0.5), [], lanes, NOW)!.lateralOffset).toBe(lim);
  });

  it("moves off an occupied candidate", () => {
    const existing = [at(spot(0.5, 0), NOW)];
    const c = spot(0.5, 0);
    const s = findNearestFreeSpot(c, existing, lanes, NOW)!;
    expect(s).not.toBeNull();
    expect(isSpotFree(s, existing, lanes, NOW)).toBe(true);
    expect(riverSpotDistance(s, c, lane)).toBeGreaterThan(0);
  });

  it("never returns an overlapping spot and is deterministic", () => {
    const items: RiverPlacementSource[] = [];
    for (let i = 0; i < 40; i++) {
      const s = findNearestFreeSpot(spot((i * 0.137) % 1, 0.3 - ((i % 5) * 0.15)), items, lanes, NOW)!;
      items.push(at(s, NOW));
    }
    let seed = 1;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 200; i++) {
      const c = spot(rnd(), (rnd() - 0.5) * 0.8);
      const r = findNearestFreeSpot(c, items, lanes, NOW);
      if (r !== null) expect(isSpotFree(r, items, lanes, NOW)).toBe(true);
      if (i < 5) {
        expect(findNearestFreeSpot(c, items, lanes, NOW)).toEqual(r);
        expect(findNearestFreeSpot(c, [...items].reverse(), lanes, NOW)).toEqual(r);
      }
    }
  });

  it("returns null for an unknown lane or NaN", () => {
    expect(findNearestFreeSpot(spot(0.1, 0, 99), [], lanes, NOW)).toBeNull();
    expect(findNearestFreeSpot(spot(NaN, 0), [], lanes, NOW)).toBeNull();
  });

  it("fills the lane with at least the zone cap, then reports full", { timeout: 30_000 }, () => {
    const items: RiverPlacementSource[] = [];
    const release = spot(0.4, 0.39);
    for (;;) {
      const s = findNearestFreeSpot(release, items, lanes, NOW);
      if (s === null) break;
      items.push(at(s, NOW));
      expect(items.length).toBeLessThan(1000);
    }
    expect(items.length).toBeGreaterThanOrEqual(ZONE_ITEM_CAP_FOR_TEST);
    const spots = items.map((i) => riverSpotOf(i, lanes, NOW)!);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(riverSpotDistance(spots[i], spots[j], lane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING - 1e-9);
      }
    }
    expect(findNearestFreeSpot(release, items, lanes, NOW)).toBeNull();
  });
});
