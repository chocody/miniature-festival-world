// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHRISTMAS_TREE, TREE_MAX_BANDS } from "@/config/events/christmas.tree.config";
import type { NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import type { PersistableCoord } from "@/core/coordinates/types";
import { parsePersistableCoord } from "@/core/coordinates/validateCoord";
import { bandCapacity, nearestFreeSlot, slotsOfBand, tierCountForBands, tiersOfBand } from "@/core/world/growingTree";
import { riverCoord } from "./__fixtures__/createCreation";
import { createTreePlacementStrategy, getCreationPlacementStrategy, type PlacementSource } from "./creationPlacement";
import type { ZoneItemCount, ZoneOccupant } from "./creationTypes";

const T0 = Date.parse("2026-12-20T12:00:00+07:00");
const cyl = (tierId: number, angleDeg: number, heightRatio: number): NormalizedCylindricalCoord => ({
  mode: "CYLINDRICAL_SURFACE",
  tierId,
  angleDeg,
  heightRatio,
});
const S_TOP = cyl(0, 45, 0.375);
const S_TOP_NEXT = cyl(0, 135, 0.375);
const S_BAND2_FROM_TOP = cyl(5, 45, 0.625);
const S_BAND2_3 = cyl(5, 105, 0.625);
const OFF = cyl(2, 27, 0.7);
const OFF_SNAP = cyl(2, 25, 0.6875);

const strategy = createTreePlacementStrategy(CHRISTMAS_TREE);
const occ = (id: string, coord: PersistableCoord): ZoneOccupant => ({ id, coord, createdAtMs: T0 });
const band = (b: number) => slotsOfBand(CHRISTMAS_TREE, b);

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

const parsed = (raw: unknown): PersistableCoord => {
  const p = parsePersistableCoord(raw);
  if (!p.ok) throw new Error("fixture coord invalid");
  return p.coord;
};

describe("tree placement strategy (MFW-97)", () => {
  it("TP1 acceptsCoord", () => {
    expect(bandCapacity(CHRISTMAS_TREE, 1)).toBe(75);
    expect(tierCountForBands(CHRISTMAS_TREE, TREE_MAX_BANDS)).toBe(752);
    expect(strategy.acceptsCoord(S_TOP)).toBe(true);
    expect(strategy.acceptsCoord({ ...S_TOP, tierId: 751 })).toBe(true);
    expect(strategy.acceptsCoord({ ...S_TOP, tierId: 752 })).toBe(false);
    expect(strategy.acceptsCoord(parsed(riverCoord(0.4)))).toBe(false);
    expect(strategy.acceptsCoord({ mode: "PLANAR_ZONE", u: 0.5, v: 0.5 } as PersistableCoord)).toBe(false);
  });

  it("TP2 empty event", async () => {
    const { source, reads } = fakeSource([]);
    const r = await strategy.place(S_TOP, T0, source);
    expect(r).toEqual({ zoneId: 1, coord: S_TOP, expectedOccupantIds: [] });
    expect(reads).toEqual([]);
    expect(Object.isFrozen(r.coord)).toBe(false);
    expect(Object.keys(r.coord).sort()).toEqual(["angleDeg", "heightRatio", "mode", "tierId"]);
  });

  it("TP3 taken slot", async () => {
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 1 }], { 1: [occ("a", S_TOP)] });
    const r = await strategy.place(S_TOP, T0, source);
    expect(r).toEqual({ zoneId: 1, coord: S_TOP_NEXT, expectedOccupantIds: ["a"] });
    expect(reads).toEqual([1]);
  });

  it("TP4 band full by count", async () => {
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 75 }]);
    const r = await strategy.place(S_TOP, T0, source);
    expect(r).toEqual({ zoneId: 2, coord: S_BAND2_FROM_TOP, expectedOccupantIds: [] });
    expect(reads).toEqual([]);
    const capped = createTreePlacementStrategy(CHRISTMAS_TREE, 4);
    const second = fakeSource([{ zoneId: 1, itemCount: 4 }]);
    expect((await capped.place(S_TOP, T0, second.source)).zoneId).toBe(2);
  });

  it("TP5 band full by occupants", async () => {
    const all = band(1).map((c, i) => occ(`o${i}`, c));
    expect(all).toHaveLength(75);
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 74 }], { 1: all });
    const r = await strategy.place(S_TOP, T0, source);
    expect(r).toEqual({ zoneId: 2, coord: S_BAND2_FROM_TOP, expectedOccupantIds: [] });
    expect(reads).toEqual([1]);
  });

  it("TP6 last free slot", async () => {
    const some = band(1).slice(0, 74).map((c, i) => occ(`o${i}`, c));
    const { source } = fakeSource([{ zoneId: 1, itemCount: 74 }], { 1: some });
    const r = await strategy.place(S_TOP, T0, source);
    expect(r.zoneId).toBe(1);
    expect(r.coord).toEqual(band(1)[74]);
    expect(r.expectedOccupantIds).toHaveLength(74);
  });

  it("TP7 off-lattice candidate is snapped", async () => {
    const r = await strategy.place(OFF, T0, fakeSource([]).source);
    expect(r.zoneId).toBe(1);
    expect(r.coord).toEqual(OFF_SNAP);
  });

  it("TP8 candidate from another band", async () => {
    const far = cyl(751, 90, 0.5);
    const r = await strategy.place(far, T0, fakeSource([]).source);
    expect(r.zoneId).toBe(1);
    expect(tiersOfBand(CHRISTMAS_TREE, 1)).toContain((r.coord as NormalizedCylindricalCoord).tierId);
    expect(r.coord).toEqual(nearestFreeSlot(CHRISTMAS_TREE, far, [], 1));
    const r2 = await strategy.place(S_BAND2_3, T0, fakeSource([{ zoneId: 1, itemCount: 75 }]).source);
    expect(r2.zoneId).toBe(2);
    expect(r2.coord).toEqual(S_BAND2_3);
  });

  it("TP9 gap band is not read", async () => {
    const { source, reads } = fakeSource([{ zoneId: 1, itemCount: 75 }, { zoneId: 3, itemCount: 4 }]);
    const r = await strategy.place(S_TOP, T0, source);
    expect(r.zoneId).toBe(2);
    expect(reads).toEqual([]);
  });

  it("TP10 occupants that take no slot", async () => {
    const zone = [occ("s", parsed(riverCoord(0.4))), occ("x", S_BAND2_3), occ("y", OFF)];
    const { source } = fakeSource([{ zoneId: 1, itemCount: 3 }], { 1: zone });
    const cand = band(1)[1]!;
    const r = await strategy.place(cand, T0, source);
    expect(r.coord).toEqual(cand);
    expect(r.expectedOccupantIds).toEqual(["s", "x", "y"]);
    const r2 = await strategy.place(OFF_SNAP, T0, source);
    expect(r2.coord).not.toEqual(OFF_SNAP);
  });

  it("TP11 deterministic", async () => {
    const a = occ("a", S_TOP);
    const b = occ("b", S_TOP_NEXT);
    const r1 = await strategy.place(S_TOP, T0, fakeSource([{ zoneId: 1, itemCount: 2 }], { 1: [a, b] }).source);
    const r2 = await strategy.place(S_TOP, T0 + 99, fakeSource([{ zoneId: 1, itemCount: 2 }], { 1: [b, a] }).source);
    expect(r1.zoneId).toBe(r2.zoneId);
    expect(r1.coord).toEqual(r2.coord);
    const again = await strategy.place(S_TOP, T0 + 5000, fakeSource([{ zoneId: 1, itemCount: 2 }], { 1: [a, b] }).source);
    expect(again).toEqual(r1);
  });

  it("TP12 errors and registry", async () => {
    await expect(strategy.place(parsed(riverCoord(0.4)), T0, fakeSource([]).source)).rejects.toBeInstanceOf(RangeError);
    const failing: PlacementSource = {
      zoneItemCounts: async () => {
        throw new Error("backend down");
      },
      listZoneOccupants: async () => [],
    };
    await expect(strategy.place(S_TOP, T0, failing)).rejects.toThrow("backend down");
    const small = createTreePlacementStrategy({ ...CHRISTMAS_TREE, maxBands: 2 });
    const full = fakeSource([{ zoneId: 1, itemCount: 75 }, { zoneId: 2, itemCount: 78 }]);
    await expect(small.place(S_TOP, T0, full.source)).rejects.toBeInstanceOf(RangeError);
    const reg = getCreationPlacementStrategy("christmas");
    expect(reg).not.toBeNull();
    expect(getCreationPlacementStrategy("christmas")).toBe(reg);
    expect(reg!.acceptsCoord(S_TOP)).toBe(true);
  });
});
