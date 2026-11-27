import { describe, expect, it } from "vitest";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import { acrossOf, alongOf, createEndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import { LOY_KRATHONG_RIVER_ENVIRONMENT } from "@/config/events/loyKrathong.river.config";
import {
  RIVER_CHANNEL_CURVE_ID,
  buildRibbonGeometryData,
  createRiverChannel,
  resolveBankPlacement,
  resolvePierLayout,
  buildGroundStripsData,
  buildRibbonRowsGeometryData,
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
    ground: { y: -0.5, holeMargin: 0.5, outerAcross: 20 },
    houses: [HOUSE, { ...HOUSE, progress: 0.3, roof: "pyramid" }],
    houseFacade: { windows: [{ x: -0.2, y: 0.3, z: 0.3 }, { x: 0.2, y: 0.3, z: 0.3 }] },
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
    expect([l.bushes.length, l.rocks.length, l.houseWindows.length]).toEqual([1, 1, 4]);
    expect(l.housesByRoof.gable).toEqual([l.houses[0]]);
    expect(l.housesByRoof.pyramid).toEqual([l.houses[1]]);
    expect(l.ribbonSegments).toBe(4);
    expect(l.ground).toMatchObject(def.ground);
    // MFW-58: straight channel (z = 0, width 4), 3-wide banks, holeMargin 0.5: strip inner edges at |z| = 4.5, outer at |z| = 20,
    // plus the two cap rows; 2 strips × 4 quads + 2 caps × 1 quad.
    expect(l.ground.strips.indices.length / 3).toBe(2 * 2 * def.ribbonSegments + 2 * 2);
    const zs = new Set<number>();
    for (let i = 0; i < l.ground.strips.vertexCount; i++) zs.add(Math.round(Math.abs(l.ground.strips.positions[i * 3 + 2]) * 1e4) / 1e4);
    expect([...zs].sort((a, b) => a - b)).toEqual([4.5, 20]);
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
    ground: { y: -0.5, holeMargin: 0.5, outerAcross: 20 },
    houses: [{ ...PLACEMENT, roof: "pyramid" }],
    houseFacade: { windows: [] },
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
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, outerAcross: 0 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, outerAcross: Number.NaN } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, outerAcross: 4 } })).toThrow(/outerAcross/); // < inner edge 4.5
    expect(() => resolveRiverEnvironment({ ...base, ribbonSegments: 1 })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, holeMargin: -1 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, holeMargin: 3 } })).toThrow(RangeError);
    expect(() => resolveRiverEnvironment({ ...base, ground: { ...base.ground, holeMargin: Number.NaN } })).toThrow(RangeError);
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
  it("C1 (MFW-66): an offset yaw adds to the house yaw; positions keep the same formula", () => {
    const h = house(0.5);
    const [f] = resolveHouseFeatures([h], [{ x: 0.3, y: 0.2, z: 0, yawRad: Math.PI / 2 }]);
    expect(f.position.x).toBeCloseTo(1 + 0.3 * 2 * Math.cos(0.5), 12);
    expect(f.position.y).toBeCloseTo(2 + 0.2 * 2, 12);
    expect(f.position.z).toBeCloseTo(3 - 0.3 * 2 * Math.sin(0.5), 12);
    expect(f.yawRad).toBeCloseTo(0.5 + Math.PI / 2, 12);
    expect(f.scale).toBe(2);
    const [g] = resolveHouseFeatures([h], [{ x: 0.3, y: 0.2, z: 0 }]);
    expect(g.yawRad).toBe(0.5);
    expect(g.position).toEqual(f.position);
  });
  it("orders house by house, then offset by offset", () => {
    const a = house(0);
    const b = { ...house(0), position: { x: 10, y: 0, z: 0 } };
    const out = resolveHouseFeatures([a, b], [offset, { x: 0, y: 0, z: 0 }]);
    expect(out.map((t) => t.position.x)).toEqual([2, 1, 11, 10].map((n) => expect.closeTo(n, 9)));
  });
});

describe("ribbon rows and ground strips (MFW-58)", () => {
  it("buildRibbonGeometryData = buildRibbonRowsGeometryData rows 0..segments, bit-identical; partial rows match", () => {
    const full = buildRibbonGeometryData(channel, -2, 3, 6);
    const rows = buildRibbonRowsGeometryData(channel, -2, 3, 6, 0, 6);
    expect(Array.from(rows.positions)).toEqual(Array.from(full.positions));
    expect(Array.from(rows.indices)).toEqual(Array.from(full.indices));
    const tail = buildRibbonRowsGeometryData(channel, -2, 3, 6, 5, 6);
    expect(Array.from(tail.positions)).toEqual(Array.from(full.positions.slice(5 * 6)));
    expect(() => buildRibbonRowsGeometryData(channel, -2, 3, 6, 3, 3)).toThrow(RangeError);
    expect(() => buildRibbonRowsGeometryData(channel, -2, 3, 6, 0, 7)).toThrow(RangeError);
  });

  const def = LOY_KRATHONG_RIVER_ENVIRONMENT;
  const lkChannel = createRiverChannel(def.channel);
  const frame = createEndlessRiverFrame(def.channel.controlPoints);
  const inner = def.channel.width / 2 + def.bankWidth - def.ground.holeMargin;
  const strips = buildGroundStripsData(lkChannel, frame, inner, def.ground.outerAcross, def.ribbonSegments);
  const n = def.ribbonSegments;
  const vx = (i: number) => strips.positions[i * 3];
  const vz = (i: number) => strips.positions[i * 3 + 2];
  /** Signed xz area ×2 of triangle t, with the same convention for the water ribbon. */
  const signed = (data: { positions: Float32Array; indices: Uint32Array }, t: number) => {
    const p = (k: number) => [data.positions[data.indices[t * 3 + k] * 3], data.positions[data.indices[t * 3 + k] * 3 + 2]];
    const [a, b, c] = [p(0), p(1), p(2)];
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  };

  it("never folds: every strip triangle has the water ribbon's winding (faces up) and a positive area", () => {
    const water = buildRibbonGeometryData(lkChannel, -2.4, 2.4, n);
    const sign = Math.sign(signed(water, 0));
    expect(sign).not.toBe(0);
    for (let t = 0; t < water.indices.length / 3; t++) expect(Math.sign(signed(water, t))).toBe(sign);
    for (let t = 0; t < strips.indices.length / 3; t++) {
      expect(Math.sign(signed(strips, t)), `triangle ${t}`).toBe(sign);
      expect(Math.abs(signed(strips, t))).toBeGreaterThan(1e-6);
    }
  });

  it("has a straight outer edge at across ±outerAcross (1e-5 float32) and the inner edge at the inner lateral", () => {
    for (let i = 0; i <= n; i++) {
      // left strip: 2i = outer, 2i+1 = inner; right strip: base + 2i = inner, base + 2i + 1 = outer
      const base = 2 * (n + 1);
      expect(acrossOf(frame, vx(2 * i), vz(2 * i))).toBeCloseTo(-def.ground.outerAcross, 4);
      expect(acrossOf(frame, vx(base + 2 * i + 1), vz(base + 2 * i + 1))).toBeCloseTo(def.ground.outerAcross, 4);
      const { centerline: c } = riverFrameAt(lkChannel, i / n);
      expect(Math.hypot(vx(2 * i + 1) - c.x, vz(2 * i + 1) - c.z)).toBeCloseTo(inner, 4);
      expect(Math.hypot(vx(base + 2 * i) - c.x, vz(base + 2 * i) - c.z)).toBeCloseTo(inner, 4);
      // The outer vertex sits at the centreline's along coordinate (rows stay perpendicular to the axis).
      expect(alongOf(frame, vx(2 * i), vz(2 * i))).toBeCloseTo(alongOf(frame, c.x, c.z), 4);
    }
    expect(strips.indices.length / 3).toBeLessThanOrEqual(4 * (n + 1) * 2);
  });

  it("joins the next copy: the last row of stretch s meets the first row of stretch s + 1 (offset T), within 1e-4", () => {
    // Outer vertices join exactly (same along, same across); inner vertices within the centreline's seam gap (lead probe < 1e-4).
    const base = 2 * (n + 1);
    const pairs = [
      [2 * n, 0],
      [2 * n + 1, 1],
      [base + 2 * n, base],
      [base + 2 * n + 1, base + 1],
    ];
    for (const [end, start] of pairs) {
      expect(Math.hypot(vx(end) - (vx(start) + frame.periodX), vz(end) - (vz(start) + frame.periodZ))).toBeLessThan(1e-4);
    }
  });

  it("rejects an outer edge that does not clear the inner edge", () => {
    expect(() => buildGroundStripsData(lkChannel, frame, inner, inner - 1, n)).toThrow(RangeError);
    expect(() => buildGroundStripsData(lkChannel, frame, inner, def.ground.outerAcross, 1)).toThrow(RangeError);
  });
});

describe("ribbon columns (MFW-79)", () => {
  /** The pre-MFW-79 ribbon builder, verbatim: two vertices per row (the bit-identity reference). */
  function legacyRibbonRows(from: number, to: number, segments: number, fromRow: number, toRow: number) {
    const rows = toRow - fromRow;
    const vertexCount = (rows + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(rows * 6);
    for (let r = 0; r <= rows; r++) {
      const { centerline: c, right } = riverFrameAt(lkChannel, (fromRow + r) / segments);
      const o = r * 6;
      positions[o] = c.x + right.x * from;
      positions[o + 2] = c.z + right.z * from;
      positions[o + 3] = c.x + right.x * to;
      positions[o + 5] = c.z + right.z * to;
    }
    for (let i = 0; i < rows; i++) {
      const a = 2 * i;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    return { positions, indices, vertexCount };
  }
  const lkChannel = createRiverChannel(LOY_KRATHONG_RIVER_ENVIRONMENT.channel);
  const xzCross = (d: { positions: Float32Array; indices: Uint32Array }, t: number) => {
    const [a, b, c] = [d.indices[t * 3], d.indices[t * 3 + 1], d.indices[t * 3 + 2]];
    const ax = d.positions[a * 3];
    const az = d.positions[a * 3 + 2];
    const ux = d.positions[b * 3] - ax;
    const uz = d.positions[b * 3 + 2] - az;
    const vx = d.positions[c * 3] - ax;
    const vz = d.positions[c * 3 + 2] - az;
    return ux * vz - uz * vx;
  };

  it("RC1: columns 2 is bit-identical to the default call and to the pre-MFW-79 ribbon (positions and indices)", () => {
    expect(buildRibbonGeometryData(channel, -1, 1, 4, 2)).toEqual(buildRibbonGeometryData(channel, -1, 1, 4));
    expect(buildRibbonRowsGeometryData(channel, -1, 1, 4, 1, 3, 2)).toEqual(buildRibbonRowsGeometryData(channel, -1, 1, 4, 1, 3));
    for (const [from, to, segments, fromRow, toRow] of [
      [-2.7, 2.7, 48, 0, 48],
      [-0.3, 1.9, 48, 1, 3],
      [-1, 1, 4, 0, 4],
    ] as const) {
      const legacy = legacyRibbonRows(from, to, segments, fromRow, toRow);
      const now = buildRibbonRowsGeometryData(lkChannel, from, to, segments, fromRow, toRow);
      expect(now.vertexCount).toBe(legacy.vertexCount);
      expect(Array.from(now.positions)).toEqual(Array.from(legacy.positions));
      expect(Array.from(now.indices)).toEqual(Array.from(legacy.indices));
    }
  });

  it("RC2: columns 4, segments 4 → 20 vertices, 72 indices, evenly spread across, every face up like the 2-column ribbon", () => {
    const d = buildRibbonGeometryData(channel, -1, 1, 4, 4);
    expect(d.vertexCount).toBe(20);
    expect(d.indices.length).toBe(72);
    for (let r = 0; r <= 4; r++) {
      const { centerline: c, right } = riverFrameAt(channel, r / 4);
      for (let k = 0; k < 4; k++) {
        const lateral = -1 + (2 * k) / 3;
        const o = (r * 4 + k) * 3;
        expect(d.positions[o]).toBeCloseTo(c.x + right.x * lateral, 6);
        expect(d.positions[o + 1]).toBe(0);
        expect(d.positions[o + 2]).toBeCloseTo(c.z + right.z * lateral, 6);
      }
    }
    const reference = Math.sign(xzCross(buildRibbonGeometryData(channel, -1, 1, 4, 2), 0));
    expect(reference).not.toBe(0);
    for (let t = 0; t < d.indices.length / 3; t++) expect(Math.sign(xzCross(d, t)), `triangle ${t}`).toBe(reference);
  });

  it("RC3: columns 1, 2.5 and NaN throw RangeError", () => {
    for (const columns of [1, 2.5, Number.NaN]) {
      expect(() => buildRibbonGeometryData(channel, -1, 1, 4, columns)).toThrow(RangeError);
      expect(() => buildRibbonRowsGeometryData(channel, -1, 1, 4, 0, 4, columns)).toThrow(RangeError);
    }
  });

  it("RC4: resolveRiverEnvironment resolves waterColumns (default 2) for the water ribbon only", () => {
    const { waterColumns: shipped, ...base } = LOY_KRATHONG_RIVER_ENVIRONMENT;
    expect(shipped).toBe(4);
    const segments = base.ribbonSegments;
    const plain = resolveRiverEnvironment(base);
    expect(plain.waterColumns).toBe(2);
    expect(plain.water.vertexCount).toBe((segments + 1) * 2);
    const four = resolveRiverEnvironment({ ...base, waterColumns: 4 });
    expect(four.waterColumns).toBe(4);
    expect(four.water.vertexCount).toBe((segments + 1) * 4);
    expect(four.banks).toEqual(plain.banks);
    expect(four.ground).toEqual(plain.ground);
    expect(() => resolveRiverEnvironment({ ...base, waterColumns: 1 })).toThrow(RangeError);
  });
});
