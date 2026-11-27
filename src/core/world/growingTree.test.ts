// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHRISTMAS_TREE, TREE_MAX_BANDS } from "@/config/events/christmas.tree.config";
import { ZONE_ITEM_CAP } from "@/config/world.config";
import { cylindricalCoordToWorld, type NormalizedCylindricalCoord } from "@/core/coordinates/CylindricalCoord";
import {
  bandCapacity,
  bandHeight,
  bandOfTier,
  isTreeTierId,
  latticeFingerprint,
  nearestFreeSlot,
  slotsOfBand,
  snapToSlot,
  tierCountForBands,
  tierDepthFromTop,
  tierShape,
  tiersOfBand,
  treeCoordToWorld,
  treeSlotKey,
  treeTierGeometry,
  treeWorldToCoord,
  type GrowingTreeConfig,
} from "./growingTree";

const TINY: GrowingTreeConfig = {
  latticeVersion: "t1",
  groundY: 0,
  trunkHeight: 1,
  skirtTiersPerBand: 2,
  maxBands: 4,
  crownTiers: [{ height: 1, bottomRadius: 1, topRadius: 0, rows: [{ heightRatio: 0.5, count: 4, angleOffsetDeg: 0 }] }],
  skirtTier: {
    height: 1,
    bottomRadius: 1,
    topRadius: 1,
    rows: [
      { heightRatio: 0.75, count: 4, angleOffsetDeg: 0 },
      { heightRatio: 0.25, count: 4, angleOffsetDeg: 45 },
    ],
  },
};

const c = (tierId: number, angleDeg: number, heightRatio: number): NormalizedCylindricalCoord => ({
  mode: "CYLINDRICAL_SURFACE",
  tierId,
  angleDeg,
  heightRatio,
});

const angleDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

const slotsOfBands = (tree: GrowingTreeConfig, from: number, to: number) => {
  const out: NormalizedCylindricalCoord[] = [];
  for (let b = from; b <= to; b++) out.push(...slotsOfBand(tree, b));
  return out;
};

describe("growing tree model (MFW-93)", () => {
  it("GT1 maps bands and tiers", () => {
    expect(tierCountForBands(TINY, 1)).toBe(1);
    expect(tierCountForBands(TINY, 4)).toBe(7);
    expect([0, 1, 2, 3, 6].map((t) => bandOfTier(TINY, t))).toEqual([1, 2, 2, 3, 4]);
    expect(tiersOfBand(TINY, 2)).toEqual([1, 2]);
    expect(isTreeTierId(TINY, 6)).toBe(true);
    for (const t of [7, -1, 0.5]) expect(isTreeTierId(TINY, t), String(t)).toBe(false);
  });

  it("GT2 throws RangeError for invalid band, tier or N", () => {
    expect(() => bandOfTier(TINY, 7)).toThrow(RangeError);
    expect(() => tiersOfBand(TINY, 0)).toThrow(RangeError);
    expect(() => tiersOfBand(TINY, 5)).toThrow(RangeError);
    expect(() => tierCountForBands(TINY, 0)).toThrow(RangeError);
    expect(() => tierCountForBands(TINY, 1.5)).toThrow(RangeError);
    expect(() => treeTierGeometry(TINY, 3, 2)).toThrow(RangeError);
  });

  it("GT3 tier geometry (TINY)", () => {
    expect(treeTierGeometry(TINY, 2, 2).baseY).toBe(1);
    expect(treeTierGeometry(TINY, 1, 2).baseY).toBe(2);
    expect(treeTierGeometry(TINY, 0, 2).baseY).toBe(3);
    expect(treeTierGeometry(TINY, 0, 3).baseY).toBe(5);
    expect(bandHeight(TINY, 1)).toBe(1);
    expect(bandHeight(TINY, 2)).toBe(2);
    expect([0, 1, 3].map((t) => tierDepthFromTop(TINY, t))).toEqual([0, 1, 3]);
  });

  it("GT4 tier geometry (CHRISTMAS_TREE)", () => {
    expect(treeTierGeometry(CHRISTMAS_TREE, 0, 1)).toEqual({
      tierId: 0,
      baseY: 5.5,
      height: 1,
      bottomRadius: 0.75,
      topRadius: 0.125,
    });
    expect(treeTierGeometry(CHRISTMAS_TREE, 0, 2).baseY).toBe(9.625);
    expect(treeTierGeometry(CHRISTMAS_TREE, 4, 1).baseY).toBe(0.5);
    expect(treeTierGeometry(CHRISTMAS_TREE, 5, 2).baseY).toBe(3.25);
    expect([4, 5, 7, 8].map((t) => bandOfTier(CHRISTMAS_TREE, t))).toEqual([1, 2, 2, 3]);
    expect(tiersOfBand(CHRISTMAS_TREE, 2)).toEqual([5, 6, 7]);
  });

  it("GT5 tier shape is independent of N", () => {
    for (const t of [1, 2, 3].flatMap((b) => tiersOfBand(CHRISTMAS_TREE, b))) {
      const shape = tierShape(CHRISTMAS_TREE, t);
      for (const n of [3, 7, 250]) {
        const g = treeTierGeometry(CHRISTMAS_TREE, t, n);
        expect([g.height, g.bottomRadius, g.topRadius], `t ${t} N ${n}`).toEqual([
          shape.height,
          shape.bottomRadius,
          shape.topRadius,
        ]);
      }
    }
  });

  it("GT6 slot lattice order and values (TINY)", () => {
    const tier = (t: number) => [
      ...[0, 90, 180, 270].map((a) => c(t, a, 0.75)),
      ...[45, 135, 225, 315].map((a) => c(t, a, 0.25)),
    ];
    expect(slotsOfBand(TINY, 2)).toEqual([...tier(1), ...tier(2)]);
    expect(bandCapacity(TINY, 1)).toBe(4);
  });

  it("GT7 capacity ≤ ZONE_ITEM_CAP for every band; keys unique; angles in [0, 360)", () => {
    for (let n = 1; n <= TREE_MAX_BANDS; n++) {
      const cap = bandCapacity(CHRISTMAS_TREE, n);
      expect(cap, `band ${n}`).toBeGreaterThan(0);
      expect(cap, `band ${n}`).toBeLessThanOrEqual(ZONE_ITEM_CAP);
    }
    expect(bandCapacity(CHRISTMAS_TREE, 1)).toBe(75);
    expect(bandCapacity(CHRISTMAS_TREE, 2)).toBe(78);
    const slots = slotsOfBands(CHRISTMAS_TREE, 1, 3);
    expect(new Set(slots.map(treeSlotKey)).size).toBe(slots.length);
    for (const s of slots) {
      expect(s.angleDeg).toBeGreaterThanOrEqual(0);
      expect(s.angleDeg).toBeLessThan(360);
    }
  });

  it("GT8 snaps to the nearest slot of the same tier", () => {
    expect(snapToSlot(TINY, c(2, 100, 0.6))).toEqual(c(2, 90, 0.75));
    expect(snapToSlot(TINY, c(1, 360, 0.75))).toEqual(c(1, 0, 0.75));
    expect(snapToSlot(TINY, c(7, 0, 0.5))).toBeNull();
    expect(snapToSlot(TINY, c(1, Number.NaN, 0.5))).toBeNull();
    for (const s of slotsOfBands(CHRISTMAS_TREE, 1, 3)) expect(snapToSlot(CHRISTMAS_TREE, s)).toEqual(s);
  });

  it("GT9 nearest free slot in tree space (TINY, band 2)", () => {
    expect(nearestFreeSlot(TINY, c(1, 10, 0.75), [], 2)).toEqual(c(1, 0, 0.75));
    expect(nearestFreeSlot(TINY, c(1, 10, 0.75), [c(1, 0, 0.75)], 2)).toEqual(c(1, 45, 0.25));
    expect(nearestFreeSlot(TINY, c(1, 350, 0.75), [], 2)).toEqual(c(1, 0, 0.75));
    expect(nearestFreeSlot(TINY, c(1, 45, 0.75), [c(1, 45, 0.25)], 2)).toEqual(c(1, 0, 0.75));
    expect(nearestFreeSlot(TINY, c(1, 0, 0.75), [c(1, 2, 0.74)], 2)).toEqual(c(1, 45, 0.25));
    expect(nearestFreeSlot(TINY, c(0, 100, 0.5), [], 2)).toEqual(c(1, 90, 0.75));
    expect(nearestFreeSlot(TINY, c(1, 10, 0.75), [c(3, 0, 0.75)], 2)).toEqual(c(1, 0, 0.75));
    const all = slotsOfBand(TINY, 2);
    expect(all).toHaveLength(16);
    expect(nearestFreeSlot(TINY, c(1, 10, 0.75), all, 2)).toBeNull();
    expect(() => nearestFreeSlot(TINY, c(9, 0, 0.5), [], 2)).toThrow(RangeError);
  });

  it("GT10 coord → world(N) → coord round-trip (invariant B)", () => {
    for (const n of [1, 2, 7]) {
      for (const s of slotsOfBands(CHRISTMAS_TREE, 1, n)) {
        const world = treeCoordToWorld(CHRISTMAS_TREE, s, n);
        expect(world).toEqual(cylindricalCoordToWorld(s, treeTierGeometry(CHRISTMAS_TREE, s.tierId, n)));
        const back = treeWorldToCoord(CHRISTMAS_TREE, world, n);
        const where = `N ${n} slot ${treeSlotKey(s)}`;
        expect(back, where).not.toBeNull();
        expect(back?.tierId, where).toBe(s.tierId);
        expect(Math.abs((back?.heightRatio ?? Number.NaN) - s.heightRatio), where).toBeLessThanOrEqual(1e-9);
        expect(angleDiff(back?.angleDeg ?? Number.NaN, s.angleDeg), where).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("GT11 world(c, N+1) − world(c, N) = (0, bandHeight(N+1), 0) exactly", () => {
    for (const n of [1, 2, 3, 7, 100, TREE_MAX_BANDS - 1]) {
      const slots = [...slotsOfBands(CHRISTMAS_TREE, 1, Math.min(n, 3)), ...(n > 3 ? slotsOfBand(CHRISTMAS_TREE, n) : [])];
      const shift = bandHeight(CHRISTMAS_TREE, n + 1);
      for (const s of slots) {
        const a = treeCoordToWorld(CHRISTMAS_TREE, s, n);
        const b = treeCoordToWorld(CHRISTMAS_TREE, s, n + 1);
        const where = `N ${n} slot ${treeSlotKey(s)}`;
        expect(b.x - a.x, where).toBe(0);
        expect(b.z - a.z, where).toBe(0);
        expect(b.y - a.y, where).toBe(shift);
      }
    }
  });

  it("GT12 inverse edges (TINY, N = 2)", () => {
    expect(treeWorldToCoord(TINY, { x: 0, y: 2.5, z: 1 }, 2)).toEqual(c(1, 0, 0.5));
    expect(treeWorldToCoord(TINY, { x: -1, y: 2.5, z: 0 }, 2)?.angleDeg).toBe(270);
    const boundary = treeWorldToCoord(TINY, { x: 0, y: 2, z: 1 }, 2);
    expect([boundary?.tierId, boundary?.heightRatio]).toEqual([1, 0]);
    const top = treeWorldToCoord(TINY, { x: 0, y: 4, z: 1 }, 2);
    expect([top?.tierId, top?.heightRatio]).toEqual([0, 1]);
    expect(treeWorldToCoord(TINY, { x: 0, y: 4.01, z: 1 }, 2)).toBeNull();
    expect(treeWorldToCoord(TINY, { x: 0, y: 0.99, z: 1 }, 2)).toBeNull();
    expect(treeWorldToCoord(TINY, { x: Number.NaN, y: 2.5, z: 1 }, 2)).toBeNull();
  });

  it("GT13 slot key", () => {
    expect(treeSlotKey(c(1, 45, 0.25))).toBe("1|45|0.25");
  });

  it("GT14 lattice fingerprint", () => {
    // Frozen at launch: stored coords depend on this lattice. A change needs a new latticeVersion (plan §6 risk 4).
    expect(latticeFingerprint(CHRISTMAS_TREE)).toBe(
      'growing-tree-v1:{"crown":[[[0.375,4,45]],[[0.3125,7,0]],[[0.6875,7,25],[0.25,9,0]],[[0.6875,10,18],[0.25,12,0]],[[0.625,12,15],[0.1875,14,0]]],"skirt":[[0.625,12,15],[0.1875,14,0]],"skirtTiersPerBand":3}',
    );
    const base = latticeFingerprint(TINY);
    const recount: GrowingTreeConfig = {
      ...TINY,
      skirtTier: { ...TINY.skirtTier, rows: [{ heightRatio: 0.75, count: 5, angleOffsetDeg: 0 }, TINY.skirtTier.rows[1]] },
    };
    expect(latticeFingerprint(recount)).not.toBe(base);
    const radius: GrowingTreeConfig = { ...TINY, skirtTier: { ...TINY.skirtTier, bottomRadius: 1.5 } };
    expect(latticeFingerprint(radius)).toBe(base);
    expect(latticeFingerprint({ ...TINY, trunkHeight: 2 })).toBe(base);
    expect(latticeFingerprint({ ...TINY, maxBands: 9 })).toBe(base);
  });
});
