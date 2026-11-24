// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LOY_KRATHONG_RIVER_LANE_ID } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR, RIVER_MIN_CENTER_SPACING } from "@/config/riverFlow.config";
import type { PersistableCoord } from "@/core/coordinates/types";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import {
  findNearestFreeSpot,
  isSpotFree,
  riverCoordFromSpot,
  riverSpotDistance,
  riverSpotLateralLimit,
  riverSpotOf,
} from "@/core/world/riverCollision";
import { getLoyKrathongRiverLanes } from "@/core/world/riverLanes";
import { riverCoord } from "./__fixtures__/createCreation";
import { createRiverPlacementStrategy, getCreationPlacementStrategy, type PlacementSource } from "./creationPlacement";
import type { ZoneItemCount, ZoneOccupant } from "./creationTypes";

const lanes = getLoyKrathongRiverLanes();
const lane = lanes.get(LOY_KRATHONG_RIVER_LANE_ID)!;
const T0 = Date.parse("2026-11-24T12:00:00.000Z");
const strategy = createRiverPlacementStrategy(lanes);

const coordOf = (spawnProgress: number, lateral = 0, speed = RIVER_DRIFT_SPEED_FACTOR): PersistableCoord => {
  const parsed = parsePersistableCoord({ ...riverCoord(spawnProgress, lateral), speedFactor: speed });
  if (!parsed.ok) throw new Error("fixture coord invalid");
  return parsed.coord;
};

const occupantAt = (id: string, progress: number, lateral: number, createdAtMs: number): ZoneOccupant => ({
  id,
  coord: riverCoordFromSpot({ laneId: 1, progress, lateralOffset: lateral }, createdAtMs),
  createdAtMs,
});

function fakeSource(counts: ZoneItemCount[], zones: Record<number, ZoneOccupant[]> = {}) {
  const reads: number[] = [];
  const source: PlacementSource = {
    zoneItemCounts: async () => counts,
    listZoneOccupants: async (zoneId) => {
      reads.push(zoneId);
      return zones[zoneId] ?? [];
    },
  };
  return { source, reads };
}

describe("river placement strategy", () => {
  it("acceptsCoord only for a known river lane", () => {
    expect(strategy.acceptsCoord(coordOf(0.4))).toBe(true);
    for (const laneId of [0, 2]) {
      const c = parsePersistableCoord({ ...riverCoord(0.4), laneId });
      expect(c.ok && strategy.acceptsCoord(c.coord)).toBe(false);
    }
    const planar = parsePersistableCoord({ mode: "PLANAR_ZONE", u: 0.5, v: 0.5 });
    expect(planar.ok && strategy.acceptsCoord(planar.coord)).toBe(false);
    expect(planar.ok).toBe(true);
    const cyl = parsePersistableCoord({ mode: "CYLINDRICAL_SURFACE", tierId: 1, angleDeg: 10, heightRatio: 0.5 });
    expect(cyl.ok && strategy.acceptsCoord(cyl.coord)).toBe(false);
    expect(cyl.ok).toBe(true);
  });

  it("empty event: zone 1, client spot kept, drift speed forced", async () => {
    const { source, reads } = fakeSource([]);
    const r = await strategy.place(coordOf(0.4, 0, 0.5), T0, source);
    expect(r.zoneId).toBe(1);
    expect(r.coord).toMatchObject({ mode: "SPLINE_PATH", spawnProgress: 0.4, lateralOffset: 0, speedFactor: RIVER_DRIFT_SPEED_FACTOR });
    expect(r.expectedOccupantIds).toEqual([]);
    expect(reads).toEqual([]);
  });

  it("clamps the lateral offset", async () => {
    const { source } = fakeSource([]);
    const r = await strategy.place(coordOf(0.4, 0.5), T0, source);
    expect(r.coord.mode === "SPLINE_PATH" && r.coord.lateralOffset).toBeCloseTo(riverSpotLateralLimit(lane), 10);
  });

  it("moves an overlapping spot", async () => {
    const a = occupantAt("00000000-0000-4000-8000-00000000000a", 0.4, 0, T0);
    const t1 = T0 + 10_000;
    const { source } = fakeSource([{ zoneId: 1, itemCount: 1 }], { 1: [a] });
    const desired = coordOf(0.48);
    const r = await strategy.place(desired, t1, source);
    expect(r.coord).not.toEqual(desired);
    expect(r.expectedOccupantIds).toEqual([a.id]);
    const spot = riverSpotOf({ coord: r.coord as never, createdAtMs: t1 }, lanes, t1)!;
    expect(isSpotFree(spot, [a as never], lanes, t1)).toBe(true);
    expect(riverSpotDistance(spot, riverSpotOf(a as never, lanes, t1)!, lane)).toBeGreaterThanOrEqual(RIVER_MIN_CENTER_SPACING);
    const expected = riverCoordFromSpot(
      findNearestFreeSpot({ laneId: 1, progress: 0.48, lateralOffset: 0 }, [a as never], lanes, t1)!,
      t1,
    );
    expect(r.coord).toEqual(expected);
  });

  it("skips a full zone without reading it", async () => {
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 80 }]);
    const r = await strategy.place(coordOf(0.4), T0, source);
    expect(r.zoneId).toBe(2);
    expect(r.expectedOccupantIds).toEqual([]);
    expect(reads).toEqual([]);
  });

  it("fills a gap without reading it", async () => {
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 80 }, { zoneId: 3, itemCount: 5 }]);
    expect((await strategy.place(coordOf(0.4), T0, source)).zoneId).toBe(2);
    expect(reads).toEqual([]);
  });

  it("no free spot goes to the next zone", async () => {
    const occ = [occupantAt("00000000-0000-4000-8000-000000000001", 0.1, 0, T0)];
    const collision = {
      findNearestFreeSpot: (...args: Parameters<typeof findNearestFreeSpot>) =>
        args[1].length > 0 ? null : findNearestFreeSpot(...args),
      riverCoordFromSpot,
    };
    const s = createRiverPlacementStrategy(lanes, collision);
    const { source } = fakeSource([{ zoneId: 1, itemCount: 10 }], { 1: occ });
    expect((await s.place(coordOf(0.4), T0, source)).zoneId).toBe(2);
  });

  it("an occupant list at the cap counts as full", async () => {
    const eighty = Array.from({ length: 80 }, (_, i) =>
      occupantAt(`00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, i / 80, 0, T0),
    );
    const { source } = fakeSource([{ zoneId: 1, itemCount: 79 }], { 1: eighty });
    expect((await strategy.place(coordOf(0.4), T0, source)).zoneId).toBe(2);
  });

  it("non-river occupants keep their id and do not collide", async () => {
    const planar = parsePersistableCoord({ mode: "PLANAR_ZONE", u: 0.5, v: 0.5 });
    if (!planar.ok) throw new Error("fixture");
    const o: ZoneOccupant = { id: "00000000-0000-4000-8000-0000000000bb", coord: planar.coord, createdAtMs: T0 };
    const { source } = fakeSource([{ zoneId: 1, itemCount: 1 }], { 1: [o] });
    const r = await strategy.place(coordOf(0.4), T0, source);
    expect(r.zoneId).toBe(1);
    expect(r.expectedOccupantIds).toEqual([o.id]);
    expect(r.coord).toMatchObject({ spawnProgress: 0.4, lateralOffset: 0 });
  });

  it("is deterministic and order independent", async () => {
    const a = occupantAt("00000000-0000-4000-8000-00000000000a", 0.4, 0, T0);
    const b = occupantAt("00000000-0000-4000-8000-00000000000b", 0.41, 0.2, T0);
    const run = async (list: ZoneOccupant[]) =>
      (await strategy.place(coordOf(0.45), T0 + 1000, fakeSource([{ zoneId: 1, itemCount: 2 }], { 1: list }).source)).coord;
    expect(await run([a, b])).toEqual(await run([a, b]));
    expect(await run([a, b])).toEqual(await run([b, a]));
  });

  it("registry", () => {
    expect(getCreationPlacementStrategy("christmas")).toBeNull();
    expect(getCreationPlacementStrategy("loy_krathong")).toBe(getCreationPlacementStrategy("loy_krathong"));
  });

  it("rejects bad coords and propagates backend errors", async () => {
    const cyl = parsePersistableCoord({ mode: "CYLINDRICAL_SURFACE", tierId: 1, angleDeg: 10, heightRatio: 0.5 });
    if (!cyl.ok) throw new Error("fixture");
    await expect(strategy.place(cyl.coord, T0, fakeSource([]).source)).rejects.toBeInstanceOf(RangeError);
    const failing: PlacementSource = { zoneItemCounts: vi.fn().mockRejectedValue(new Error("down")), listZoneOccupants: async () => [] };
    await expect(strategy.place(coordOf(0.4), T0, failing)).rejects.toThrow("down");
  });
});
