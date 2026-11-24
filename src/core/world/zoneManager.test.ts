// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { INITIAL_ZONE_POLICIES, WORLD_INITIAL_ZONE_POLICY, ZONE_ITEM_CAP } from "@/config/world.config";
import type { RiverPlacementSource } from "@/core/coordinates";
import { findNearestFreeSpot } from "./riverCollision";
import { getLoyKrathongRiverLanes } from "./riverLanes";
import {
  assignZoneForNewCreation,
  isClientZoneId,
  isZoneFull,
  pickInitialZoneId,
  zoneCountFromHighestZoneId,
  type ZoneFill,
} from "./zoneManager";

const T0 = 1_700_000_000_000;
const fill = (zoneId: number, itemCount: number, hasFreeSpot: boolean): ZoneFill => ({ zoneId, itemCount, hasFreeSpot });

describe("assignZoneForNewCreation", () => {
  it("returns zone 1 for an empty event", () => {
    expect(assignZoneForNewCreation([])).toBe(1);
  });
  it("stays below the cap and opens a new zone at it", () => {
    expect(assignZoneForNewCreation([fill(1, 79, true)])).toBe(1);
    expect(assignZoneForNewCreation([fill(1, 80, true)])).toBe(2);
    expect(assignZoneForNewCreation([fill(1, 85, true)])).toBe(2);
  });
  it("free spot rule (owner decision 25)", () => {
    expect(assignZoneForNewCreation([fill(1, 10, false)])).toBe(2);
    expect(assignZoneForNewCreation([fill(1, 80, true), fill(2, 3, true)])).toBe(2);
    expect(assignZoneForNewCreation([fill(1, 80, true), fill(2, 3, false)])).toBe(3);
  });
  it("first zone below the cap wins, in any input order", () => {
    const fills = [fill(1, 80, true), fill(2, 40, true), fill(3, 10, true)];
    expect(assignZoneForNewCreation(fills)).toBe(2);
    expect(assignZoneForNewCreation([...fills].reverse())).toBe(2);
    expect(assignZoneForNewCreation([fills[1], fills[2], fills[0]])).toBe(2);
  });
  it("gaps count as empty; custom cap", () => {
    expect(assignZoneForNewCreation([fill(1, 80, true), fill(3, 80, true)])).toBe(2);
    expect(assignZoneForNewCreation([fill(1, 2, true)], 2)).toBe(2);
  });
  it("integrates with findNearestFreeSpot", () => {
    const lanes = getLoyKrathongRiverLanes();
    const existing: RiverPlacementSource[] = [];
    const candidate = { laneId: LOY_KRATHONG_RIVER_LANE_ID, progress: 0, lateralOffset: 0 };
    let free = true;
    for (let i = 0; i < ZONE_ITEM_CAP && free; i++) {
      const spot = findNearestFreeSpot(candidate, existing, lanes, T0);
      if (spot === null) {
        free = false;
        break;
      }
      existing.push({
        coord: {
          mode: "SPLINE_PATH",
          laneId: spot.laneId,
          spawnProgress: spot.progress,
          speedFactor: RIVER_DRIFT_SPEED_FACTOR,
          lateralOffset: spot.lateralOffset,
        },
        createdAtMs: T0,
      });
    }
    const hasFreeSpot = findNearestFreeSpot(candidate, existing, lanes, T0) !== null;
    if (hasFreeSpot) {
      // the lane holds at least 80: the zone is full by count at the cap
      expect(existing.length).toBe(ZONE_ITEM_CAP);
      expect(assignZoneForNewCreation([fill(1, existing.length - 1, true)])).toBe(1);
    }
    expect(assignZoneForNewCreation([fill(1, existing.length, hasFreeSpot)])).toBe(2);
  });
  it("throws RangeError on bad input without echoing values", () => {
    for (const cap of [0, 1.5, Number.NaN]) expect(() => assignZoneForNewCreation([], cap)).toThrow(RangeError);
    for (const z of [0, -1, 1.5]) expect(() => assignZoneForNewCreation([fill(z, 0, true)])).toThrow(RangeError);
    for (const c of [-1, Number.NaN]) expect(() => assignZoneForNewCreation([fill(1, c, true)])).toThrow(RangeError);
    expect(() => assignZoneForNewCreation([{ zoneId: 1, itemCount: 0, hasFreeSpot: "yes" as unknown as boolean }])).toThrow(RangeError);
    expect(() => assignZoneForNewCreation([fill(1, 0, true), fill(1, 0, true)])).toThrow(RangeError);
    expect(() => assignZoneForNewCreation([fill(987654, -1, true)])).toThrow(RangeError);
    try {
      assignZoneForNewCreation([fill(987654, -1, true), fill(987654, 0, true)]);
    } catch (e) {
      expect((e as Error).message).not.toContain("987654");
    }
    try {
      assignZoneForNewCreation([fill(987654.5, 0, true)]);
    } catch (e) {
      expect((e as Error).message).not.toContain("987654");
    }
  });
});

describe("zone helpers", () => {
  it("isZoneFull", () => {
    expect(isZoneFull(fill(1, 79, true))).toBe(false);
    expect(isZoneFull(fill(1, 80, true))).toBe(true);
    expect(isZoneFull(fill(1, 1, false))).toBe(true);
    expect(isZoneFull(fill(1, 2, true), 2)).toBe(true);
  });
  it("zoneCountFromHighestZoneId", () => {
    expect(zoneCountFromHighestZoneId(null)).toBe(1);
    expect(zoneCountFromHighestZoneId(3)).toBe(3);
    expect(() => zoneCountFromHighestZoneId(0)).toThrow(RangeError);
    expect(() => zoneCountFromHighestZoneId(1.5)).toThrow(RangeError);
  });
  it("isClientZoneId", () => {
    expect(isClientZoneId(1)).toBe(true);
    expect(isClientZoneId(2147483647)).toBe(true);
    for (const v of [0, -1, 1.5, "1", Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(isClientZoneId(v)).toBe(false);
  });
  it("pickInitialZoneId and the policy constant", () => {
    expect(pickInitialZoneId(3, "NEWEST")).toBe(3);
    expect(pickInitialZoneId(3, "FIRST")).toBe(1);
    expect(() => pickInitialZoneId(0, "NEWEST")).toThrow(RangeError);
    expect(() => pickInitialZoneId(0, "FIRST")).toThrow(RangeError);
    expect(INITIAL_ZONE_POLICIES).toContain(WORLD_INITIAL_ZONE_POLICY);
  });
});
