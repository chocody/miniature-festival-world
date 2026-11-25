import { describe, expect, it } from "vitest";
import { bankSurfaceY, buildBankProfileGeometryData, type BankProfilePoint } from "./bankProfile";
import {
  RIVER_CHANNEL_CURVE_ID,
  buildRibbonGeometryData,
  createRiverChannel,
  resolveBankPlacement,
  resolvePierLayout,
  groundHoleRadius,
  resolveHouseFeatures,
  resolveRiverEnvironment,
  riverFrameAt,
  type BankPlacement,
  type HousePlacement,
  type InstanceTransform,
  type PierDefinition,
  type RiverEnvironmentDefinition,
} from "./riverEnvironment";

const STRAIGHT = {
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ],
  width: 4,
};
const channel = createRiverChannel(STRAIGHT);
const PIER: PierDefinition = {
  progress: 0.5,
  side: 1,
  onBankLength: 1,
  overWaterLength: 0.5,
  width: 0.6,
  deckThickness: 0.1,
  deckTopY: 0.2,
  pileBottomY: -0.5,
  releaseInset: 0.3,
  pileAlongFractions: [0.5, 1],
};
const PLACEMENT: BankPlacement = { progress: 0.5, side: 1, setback: 1, scale: 2, yawOffsetRad: 0 };
const sc = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)];

describe("createRiverChannel", () => {
  it("rejects a non-flat channel and a bad width", () => {
    expect(() => createRiverChannel({ ...STRAIGHT, controlPoints: [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }] })).toThrow(RangeError);
    expect(() => createRiverChannel({ ...STRAIGHT, width: 0 })).toThrow(RangeError);
  });
  it("builds an open curve with the channel id", () => {
    expect(channel.closed).toBe(false);
    expect(channel.laneId).toBe(RIVER_CHANNEL_CURVE_ID);
  });
});

describe("riverFrameAt", () => {
  it("gives centreline, right and flow", () => {
    const f = riverFrameAt(channel, 0.5);
    expect(f.centerline.x).toBeCloseTo(10);
    expect(f.right.z).toBeCloseTo(1);
    expect(f.flow.x).toBeCloseTo(1);
    expect(Math.abs(f.flow.z)).toBeCloseTo(0);
    expect(() => riverFrameAt(channel, 1.5)).toThrow(RangeError);
    expect(() => riverFrameAt(channel, NaN)).toThrow(RangeError);
  });
});

describe("resolveBankPlacement", () => {
  it("places on both sides facing the water", () => {
    const r = resolveBankPlacement(channel, PLACEMENT, -0.14);
    expect(r.position.x).toBeCloseTo(10);
    expect(r.position.y).toBeCloseTo(-0.14);
    expect(r.position.z).toBeCloseTo(3);
    expect(sc(r.yawRad)[0]).toBeCloseTo(0);
    expect(sc(r.yawRad)[1]).toBeCloseTo(-1);
    expect(r.scale).toBe(2);
    const l = resolveBankPlacement(channel, { ...PLACEMENT, side: -1 }, -0.14);
    expect(l.position.z).toBeCloseTo(-3);
    expect(sc(l.yawRad)[1]).toBeCloseTo(1);
    const t = resolveBankPlacement(channel, { ...PLACEMENT, yawOffsetRad: Math.PI / 2 }, -0.14);
    expect(sc(t.yawRad)[0]).toBeCloseTo(-1);
    expect(sc(t.yawRad)[1]).toBeCloseTo(0);
  });
  it("rejects invalid placements", () => {
    expect(() => resolveBankPlacement(channel, { ...PLACEMENT, progress: 1.5 }, 0)).toThrow(RangeError);
    expect(() => resolveBankPlacement(channel, { ...PLACEMENT, side: 0 as 1 }, 0)).toThrow(RangeError);
    expect(() => resolveBankPlacement(channel, { ...PLACEMENT, setback: -1 }, 0)).toThrow(RangeError);
    expect(() => resolveBankPlacement(channel, { ...PLACEMENT, scale: 0 }, 0)).toThrow(RangeError);
  });
});

describe("buildRibbonGeometryData", () => {
  it("builds an upward-facing strip", () => {
    const d = buildRibbonGeometryData(channel, -1, 1, 4);
    expect(d.vertexCount).toBe(10);
    expect(d.positions.length).toBe(30);
    expect(d.indices.length).toBe(24);
    const v = (i: number) => [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]];
    expect(v(0)).toEqual([0, 0, -1].map((n) => expect.closeTo(n, 5)));
    expect(v(1)).toEqual([0, 0, 1].map((n) => expect.closeTo(n, 5)));
    expect(v(2)).toEqual([5, 0, -1].map((n) => expect.closeTo(n, 5)));
    expect(v(9)).toEqual([20, 0, 1].map((n) => expect.closeTo(n, 5)));
    expect(Array.from(d.indices.slice(0, 6))).toEqual([0, 1, 2, 1, 3, 2]);
    for (let t = 0; t < d.indices.length; t += 3) {
      const [a, b, c] = [v(d.indices[t]), v(d.indices[t + 1]), v(d.indices[t + 2])];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      expect(ab[2] * ac[0] - ab[0] * ac[2]).toBeGreaterThan(0); // cross.y
    }
  });
  it("rejects bad input", () => {
    expect(() => buildRibbonGeometryData(channel, 1, 1, 4)).toThrow(RangeError);
    expect(() => buildRibbonGeometryData(channel, 2, 1, 4)).toThrow(RangeError);
    expect(() => buildRibbonGeometryData(channel, -1, 1, 0)).toThrow(RangeError);
    expect(() => buildRibbonGeometryData(channel, -1, 1, 1.5)).toThrow(RangeError);
  });
});

describe("resolvePierLayout", () => {
  it("lays out deck, tip, release point and piles", () => {
    const p = resolvePierLayout(channel, PIER, -0.24);
    expect(p.deckCenter.x).toBeCloseTo(10);
    expect(p.deckCenter.y).toBeCloseTo(0.15);
    expect(p.deckCenter.z).toBeCloseTo(2.25);
    expect(p.length).toBeCloseTo(1.5);
    expect(p.tip.y).toBeCloseTo(0.2);
    expect(p.tip.z).toBeCloseTo(1.5);
    expect(p.releasePoint.y).toBeCloseTo(-0.24);
    expect(p.releasePoint.z).toBeCloseTo(1.2);
    expect(sc(p.yawRad)[1]).toBeCloseTo(-1);
    expect(p.pileHeight).toBeCloseTo(0.6);
    const expected = [[9.7, 1.75], [10.3, 1.75], [9.7, 1.5], [10.3, 1.5]];
    expect(p.piles).toHaveLength(4);
    p.piles.forEach((pile, i) => {
      expect(pile.position.x).toBeCloseTo(expected[i][0]);
      expect(pile.position.y).toBeCloseTo(-0.2);
      expect(pile.position.z).toBeCloseTo(expected[i][1]);
    });
  });
  it("rejects a pier past the centreline or under the deck", () => {
    expect(() => resolvePierLayout(channel, { ...PIER, overWaterLength: 1.8 }, 0)).toThrow(RangeError);
    expect(() => resolvePierLayout(channel, { ...PIER, pileBottomY: 0.15 }, 0)).toThrow(RangeError);
  });
});

describe("resolveRiverEnvironment", () => {
  const PROFILE: readonly BankProfilePoint[] = [
    { offset: 0, y: -0.3 },
    { offset: 0.5, y: -0.14 },
    { offset: 3, y: 0 },
  ];
  const HOUSE: HousePlacement = { ...PLACEMENT, roof: "gable" };
  const def: RiverEnvironmentDefinition = {
    channel: STRAIGHT,
    waterSurfaceY: -0.24,
    bankTopY: -0.14,
    bankWidth: 3,
    waterUnderlap: 0.2,
    ribbonSegments: 4,
    bankProfile: PROFILE,
    ground: { radius: 40, y: -0.5, segments: 16, holeMargin: 0.5 },
    houses: [HOUSE, { ...HOUSE, progress: 0.3, roof: "pyramid" }],
    houseFacade: { door: { x: 0, y: 0.1, z: 0.3 }, windows: [{ x: -0.2, y: 0.3, z: 0.3 }, { x: 0.2, y: 0.3, z: 0.3 }] },
    trees: [PLACEMENT],
    bushes: [PLACEMENT],
    rocks: [PLACEMENT],
    lamps: [PLACEMENT],
    pier: PIER,
    paths: [],
  };
  it("resolves everything", () => {
    const l = resolveRiverEnvironment(def);
    expect([l.houses.length, l.trees.length, l.lamps.length, l.pier.piles.length]).toEqual([2, 1, 1, 4]);
    expect([l.bushes.length, l.rocks.length, l.houseDoors.length, l.houseWindows.length]).toEqual([1, 1, 2, 4]);
    expect(l.housesByRoof.gable).toEqual([l.houses[0]]);
    expect(l.housesByRoof.pyramid).toEqual([l.houses[1]]);
    expect(l.ribbonSegments).toBe(4);
    expect(l.ground).toMatchObject(def.ground);
    // Straight channel (z = 0, width 4) with 3-wide banks: the outer edges are at |z| = 5, the end caps at x = 0 / 20.
    expect(l.ground.innerRadius).toBeCloseTo(0, 6); // the origin lies on the upstream end cap
    expect(l.water.positions[2]).toBeCloseTo(-2.2);
    expect(l.bounds.minX).toBeCloseTo(0);
    expect(l.bounds.maxX).toBeCloseTo(20);
    expect(l.bounds.minZ).toBeCloseTo(-5);
    expect(l.bounds.maxZ).toBeCloseTo(5);
  });
  it("banks follow the profile, rowSize = profile length", () => {
    const l = resolveRiverEnvironment(def);
    for (const bank of [l.banks.left, l.banks.right]) {
      expect(bank.rowSize).toBe(PROFILE.length);
      expect(bank.vertexCount).toBe((def.ribbonSegments + 1) * PROFILE.length);
      PROFILE.forEach((p, k) => expect(bank.positions[k * 3 + 1]).toBeCloseTo(p.y));
    }
    expect(l.banks.right.positions[2]).toBeCloseTo(2); // k = 0 at the right water edge
    expect(l.banks.left.positions[2]).toBeCloseTo(-2);
  });
  it("props sit on the bank profile", () => {
    const l = resolveRiverEnvironment(def);
    const y = bankSurfaceY(PROFILE, PLACEMENT.setback);
    for (const t of [...l.houses, ...l.trees, ...l.bushes, ...l.rocks, ...l.lamps]) expect(t.position.y).toBeCloseTo(y, 9);
  });
  it("validates bank width, underlap and setbacks", () => {
    expect(() => resolveRiverEnvironment({ ...def, houses: [{ ...HOUSE, setback: 3 }] })).toThrow(/houses\[0\]/);
    expect(() => resolveRiverEnvironment({ ...def, bushes: [{ ...PLACEMENT, setback: 3 }] })).toThrow(/bushes\[0\]/);
    expect(() => resolveRiverEnvironment({ ...def, rocks: [{ ...PLACEMENT, setback: 3 }] })).toThrow(/rocks\[0\]/);
    expect(() => resolveRiverEnvironment({ ...def, waterUnderlap: 3 })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...def, bankWidth: 0 })).toThrow(RangeError);
  });
});

describe("resolveRiverEnvironment v2 validation (MFW-49)", () => {
  const base: RiverEnvironmentDefinition = {
    channel: STRAIGHT,
    waterSurfaceY: -0.24,
    bankTopY: -0.14,
    bankWidth: 3,
    waterUnderlap: 0.2,
    ribbonSegments: 4,
    bankProfile: [
      { offset: 0, y: -0.3 },
      { offset: 3, y: 0 },
    ],
    ground: { radius: 40, y: -0.5, segments: 16, holeMargin: 0.5 },
    houses: [{ ...PLACEMENT, roof: "pyramid" }],
    houseFacade: { door: { x: 0, y: 0, z: 0 }, windows: [] },
    trees: [],
    bushes: [],
    rocks: [],
    lamps: [],
    pier: PIER,
    paths: [{ pathId: 1, side: 1, setback: 1, halfWidth: 0.2, fromProgress: 0, toProgress: 1 }],
  };
  it("accepts the fixture", () => {
    expect(() => resolveRiverEnvironment(base)).not.toThrow();
  });
  it("rejects a bad profile", () => {
    expect(() => resolveRiverEnvironment({ ...base, bankProfile: [{ offset: 0, y: -0.3 }, { offset: 2, y: 0 }] })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, bankProfile: [{ offset: 0, y: 0 }, { offset: 3, y: 0 }] })).toThrow(RangeError);
  });
  it("rejects a bad ground", () => {
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, radius: 0 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, segments: 2 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, segments: 3.5 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, y: -0.3 } })).toThrow(RangeError); // = profile[0].y
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, y: -0.2 } })).toThrow(RangeError);
  });
  it("rejects an unknown roof kind", () => {
    expect(() => resolveRiverEnvironment({ ...base, houses: [{ ...PLACEMENT, roof: "dome" as "gable" }] })).toThrow(/houses\[0\]\.roof/);
  });
  it("rejects duplicate and invalid path ids", () => {
    const path = base.paths[0];
    expect(() => resolveRiverEnvironment({ ...base, paths: [path, { ...path, side: -1 }] })).toThrow(/duplicate/);
    expect(() => resolveRiverEnvironment({ ...base, paths: [{ ...path, pathId: 0 }] })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, paths: [{ ...path, setback: 2.9 }] })).toThrow(RangeError);
  });
});

describe("resolveHouseFeatures", () => {
  const house = (yawRad: number): InstanceTransform => ({ position: { x: 1, y: 2, z: 3 }, yawRad, scale: 2 });
  const offset = { x: 0.5, y: 0.25, z: 1 };
  it("yaw 0: offset × scale, keeps yaw and scale", () => {
    const [f] = resolveHouseFeatures([house(0)], [offset]);
    expect(f.position.x).toBeCloseTo(2);
    expect(f.position.y).toBeCloseTo(2.5);
    expect(f.position.z).toBeCloseTo(5);
    expect(f.yawRad).toBe(0);
    expect(f.scale).toBe(2);
  });
  it("yaw π/2: R_y maps local +Z to world +X and local +X to world −Z", () => {
    const [f] = resolveHouseFeatures([house(Math.PI / 2)], [offset]);
    expect(f.position.x).toBeCloseTo(1 + 2); // z·scale along +X
    expect(f.position.z).toBeCloseTo(3 - 1); // −x·scale along Z
    expect(f.yawRad).toBeCloseTo(Math.PI / 2);
  });
  it("orders house by house, then offset by offset", () => {
    const a = house(0);
    const b = { ...house(0), position: { x: 10, y: 0, z: 0 } };
    const out = resolveHouseFeatures([a, b], [offset, { x: 0, y: 0, z: 0 }]);
    expect(out.map((t) => t.position.x)).toEqual([2, 1, 11, 10].map((n) => expect.closeTo(n, 9)));
  });
});

describe("groundHoleRadius (MFW-49 ground ring)", () => {
  const PROFILE: readonly BankProfilePoint[] = [
    { offset: 0, y: -0.3 },
    { offset: 3, y: 0 },
  ];
  const centred = createRiverChannel({
    controlPoints: [
      { x: -10, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    width: 4,
  });
  const banks = () => [buildBankProfileGeometryData(centred, 1, PROFILE, 8), buildBankProfileGeometryData(centred, -1, PROFILE, 8)];
  it("is the distance to the nearest outer bank edge minus the margin", () => {
    const [right, left] = banks();
    expect(groundHoleRadius(centred, left, right, 3, 0)).toBeCloseTo(5, 5); // W/2 + bankWidth
    expect(groundHoleRadius(centred, left, right, 3, 1.5)).toBeCloseTo(3.5, 5);
    expect(groundHoleRadius(centred, left, right, 3, 9)).toBe(0);
  });
  it("is 0 when the origin is outside the river outline", () => {
    const far = createRiverChannel({
      controlPoints: [
        { x: -10, y: 0, z: 50 },
        { x: 0, y: 0, z: 50 },
        { x: 10, y: 0, z: 50 },
      ],
      width: 4,
    });
    const [right, left] = banks();
    expect(groundHoleRadius(far, left, right, 3, 0)).toBe(0);
  });
  it("rejects a negative or non-finite hole margin", () => {
    const base = {
      channel: STRAIGHT,
      waterSurfaceY: -0.24,
      bankTopY: -0.14,
      bankWidth: 3,
      waterUnderlap: 0.2,
      ribbonSegments: 4,
      bankProfile: PROFILE,
      houses: [],
      houseFacade: { door: { x: 0, y: 0, z: 0 }, windows: [] },
      trees: [],
      bushes: [],
      rocks: [],
      lamps: [],
      pier: PIER,
      paths: [],
    } satisfies Omit<RiverEnvironmentDefinition, "ground">;
    expect(() => resolveRiverEnvironment({ ...base, ground: { radius: 40, y: -0.5, segments: 16, holeMargin: -1 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { radius: 40, y: -0.5, segments: 16, holeMargin: Number.NaN } })).toThrow(RangeError);
  });
});
