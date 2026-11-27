// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planarCoordToWorld,
  planarSurfaceNormal,
  worldToPlanarCoord,
  type PlanarZoneCoord,
  type PlanarZoneRect,
} from "./PlanarGridCoord";
import type { WorldVec3 } from "./types";
import { parsePersistableCoord } from "./validateCoord";

const ROUND_TRIP_TOL = 1e-9;
const NORMAL_TOL = 1e-12;

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();
const dot = (a: WorldVec3, b: WorldVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: WorldVec3): number => Math.hypot(a.x, a.y, a.z);
const sub = (a: WorldVec3, b: WorldVec3): WorldVec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: WorldVec3, s: number): WorldVec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cross = (a: WorldVec3, b: WorldVec3): WorldVec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const v3 = (x: number, y: number, z: number): WorldVec3 => ({ x, y, z });

const SKY: PlanarZoneRect = { origin: v3(-3, 10, -5), uAxis: v3(6, 0, 0), vAxis: v3(0, 5, 0) };
const pc = (u: number, v: number): PlanarZoneCoord => ({ mode: "PLANAR_ZONE", u, v });

function expectVecClose(actual: WorldVec3, expected: WorldVec3, tol: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}

function randomUnit(rng: () => number): WorldVec3 {
  for (;;) {
    const p = v3(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1));
    const n = norm(p);
    if (n > 0.1 && n <= 1) return scale(p, 1 / n);
  }
}

function randomRect(rng: () => number, i: number): PlanarZoneRect {
  const origin = v3(range(rng, -2000, 2000), range(rng, -2000, 2000), range(rng, -2000, 2000));
  const l1 = range(rng, 0.1, 20);
  const l2 = range(rng, 0.1, 20);
  if (i % 10 === 0) return { origin, uAxis: v3(l1, 0, 0), vAxis: v3(0, l2, 0) };
  const uDir = randomUnit(rng);
  for (;;) {
    const r = randomUnit(rng);
    const ortho = sub(r, scale(uDir, dot(r, uDir)));
    const n = norm(ortho);
    if (n > 0.1) return { origin, uAxis: scale(uDir, l1), vAxis: scale(ortho, l2 / n) };
  }
}

interface Sample {
  readonly rect: PlanarZoneRect;
  readonly coord: PlanarZoneCoord;
  readonly edge: boolean;
}

const EDGE_VALUES = [0, 0.5, 1] as const;
const rng = mulberry32(0x5eed130);
const RECTS: readonly PlanarZoneRect[] = Array.from({ length: 200 }, (_, i) => randomRect(rng, i));
const SAMPLES: readonly Sample[] = RECTS.flatMap((rect) => {
  const out: Sample[] = [];
  for (let k = 0; k < 25; k++) out.push({ rect, coord: pc(rng(), rng()), edge: false });
  for (const u of EDGE_VALUES) {
    for (const v of EDGE_VALUES) out.push({ rect, coord: pc(u, v), edge: u !== 0.5 || v !== 0.5 });
  }
  return out;
});

const freezeRect = (r: PlanarZoneRect): PlanarZoneRect =>
  Object.freeze({
    origin: Object.freeze({ ...r.origin }),
    uAxis: Object.freeze({ ...r.uAxis }),
    vAxis: Object.freeze({ ...r.vAxis }),
  });

describe("planarCoordToWorld", () => {
  it("PF1 maps the corners and centre of SKY", () => {
    expect(planarCoordToWorld(pc(0, 0), SKY)).toEqual({ x: -3, y: 10, z: -5 });
    expectVecClose(planarCoordToWorld(pc(1, 0), SKY), v3(3, 10, -5), 1e-12);
    expectVecClose(planarCoordToWorld(pc(0, 1), SKY), v3(-3, 15, -5), 1e-12);
    expectVecClose(planarCoordToWorld(pc(1, 1), SKY), v3(3, 15, -5), 1e-12);
    expectVecClose(planarCoordToWorld(pc(0.5, 0.5), SKY), v3(0, 12.5, -5), 1e-12);
  });
  it("PF2 throws on non-finite input and extrapolates out-of-range u, v linearly", () => {
    expect(() => planarCoordToWorld(pc(NaN, 0.5), SKY)).toThrow(RangeError);
    expect(() => planarCoordToWorld(pc(0.5, Infinity), SKY)).toThrow(RangeError);
    expect(() => planarCoordToWorld(pc(0.5, 0.5), { ...SKY, origin: v3(NaN, 10, -5) })).toThrow(RangeError);
    expectVecClose(planarCoordToWorld(pc(1.5, -0.5), SKY), v3(6, 7.5, -5), 1e-12);
  });
  it("PF3 accepts frozen inputs and returns a fresh {x, y, z}", () => {
    const rect = freezeRect(SKY);
    const c = Object.freeze(pc(0.25, 0.75));
    const a = planarCoordToWorld(c, rect);
    const b = planarCoordToWorld(c, rect);
    expect(a).not.toBe(b);
    expect(Object.keys(a).sort()).toEqual(["x", "y", "z"]);
  });
});

describe("worldToPlanarCoord", () => {
  it("PI1 inverts the centre to a persistable coord", () => {
    const r = worldToPlanarCoord(v3(0, 12.5, -5), SKY);
    expect(r).toEqual({ mode: "PLANAR_ZONE", u: 0.5, v: 0.5 });
    expect(Object.keys(r!).sort()).toEqual(["mode", "u", "v"]);
    expect(parsePersistableCoord(r).ok).toBe(true);
  });
  it("PI2 clamps hits just past an edge within tolerance", () => {
    const tol = 0.01;
    expect(worldToPlanarCoord(v3(3.005, 12.5, -5), SKY, tol)!.u).toBe(1);
    expect(worldToPlanarCoord(v3(-3.005, 12.5, -5), SKY, tol)!.u).toBe(0);
    expect(worldToPlanarCoord(v3(0, 9.995, -5), SKY, tol)!.v).toBe(0);
    expect(worldToPlanarCoord(v3(0, 15.005, -5), SKY, tol)!.v).toBe(1);
    const corner = worldToPlanarCoord(v3(3.005, 15.005, -5), SKY, tol)!;
    expect(corner.u).toBe(1);
    expect(corner.v).toBe(1);
  });
  it("PI3 returns null beyond tolerance and projects small off-plane hits", () => {
    const tol = 0.01;
    expect(worldToPlanarCoord(v3(3.02, 12.5, -5), SKY, tol)).toBeNull();
    expect(worldToPlanarCoord(v3(-3.02, 12.5, -5), SKY, tol)).toBeNull();
    expect(worldToPlanarCoord(v3(0, 9.98, -5), SKY, tol)).toBeNull();
    expect(worldToPlanarCoord(v3(0, 15.02, -5), SKY, tol)).toBeNull();
    expect(worldToPlanarCoord(v3(0, 12.5, -5 + 0.02), SKY, tol)).toBeNull();
    const projected = worldToPlanarCoord(v3(0, 12.5, -5 - 0.005), SKY, tol)!;
    expect(projected).not.toBeNull();
    expect(projected.u).toBeCloseTo(0.5, 12);
    expect(projected.v).toBeCloseTo(0.5, 12);
  });
  it("PI4 default tolerance rejects a 1e-6 off-plane hit; tolerance 0 accepts the exact centre", () => {
    expect(worldToPlanarCoord(v3(0, 12.5, -5 + 1e-6), SKY)).toBeNull();
    expect(worldToPlanarCoord(v3(0, 12.5, -5), SKY)).not.toBeNull();
    expect(worldToPlanarCoord(v3(0, 12.5, -5), SKY, 0)).toEqual({ mode: "PLANAR_ZONE", u: 0.5, v: 0.5 });
  });
  it("PI5 throws on non-finite hits and invalid tolerances", () => {
    expect(() => worldToPlanarCoord(v3(NaN, 12.5, -5), SKY)).toThrow(RangeError);
    expect(() => worldToPlanarCoord(v3(0, 12.5, Infinity), SKY)).toThrow(RangeError);
    for (const t of [-1, NaN, Infinity]) {
      expect(() => worldToPlanarCoord(v3(0, 12.5, -5), SKY, t)).toThrow(RangeError);
    }
  });
  it("PI6 accepts frozen inputs and returns a fresh object", () => {
    const rect = freezeRect(SKY);
    const hit = Object.freeze(v3(0, 12.5, -5));
    const a = worldToPlanarCoord(hit, rect);
    const b = worldToPlanarCoord(hit, rect);
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });
});

describe("planar round trip (tolerance 1e-9)", () => {
  it("RT1 forward(inverse(forward(c))) matches forward(c)", () => {
    for (const { rect, coord } of SAMPLES) {
      const w = planarCoordToWorld(coord, rect);
      const back = worldToPlanarCoord(w, rect);
      expect(back).not.toBeNull();
      expectVecClose(planarCoordToWorld(back!, rect), w, ROUND_TRIP_TOL);
    }
  });
  it("RT2 inverse(forward(c)) recovers u, v inside [0, 1]", () => {
    for (const { rect, coord } of SAMPLES) {
      const back = worldToPlanarCoord(planarCoordToWorld(coord, rect), rect)!;
      expect(Math.abs(back.u - coord.u)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(Math.abs(back.v - coord.v)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(back.u).toBeGreaterThanOrEqual(0);
      expect(back.u).toBeLessThanOrEqual(1);
      expect(back.v).toBeGreaterThanOrEqual(0);
      expect(back.v).toBeLessThanOrEqual(1);
    }
  });
  it("RT3 edges invert inside [0, 1]; origin is (0, 0); a sheared parallelogram round-trips", () => {
    const edges = SAMPLES.filter((s) => s.edge);
    expect(edges.length).toBe(RECTS.length * 8);
    for (const { rect, coord } of edges) {
      const back = worldToPlanarCoord(planarCoordToWorld(coord, rect), rect);
      expect(back).not.toBeNull();
      expect(back!.u).toBeGreaterThanOrEqual(0);
      expect(back!.u).toBeLessThanOrEqual(1);
      expect(back!.v).toBeGreaterThanOrEqual(0);
      expect(back!.v).toBeLessThanOrEqual(1);
    }
    for (const rect of RECTS) {
      const o = worldToPlanarCoord(rect.origin, rect)!;
      expect(Math.abs(o.u)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(o.v)).toBeLessThanOrEqual(1e-12);
    }
    const sheared: PlanarZoneRect = { origin: v3(0, 0, 0), uAxis: v3(2, 0, 0), vAxis: v3(1, 3, 0) };
    const back = worldToPlanarCoord(planarCoordToWorld(pc(0.25, 0.75), sheared), sheared)!;
    expect(Math.abs(back.u - 0.25)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
    expect(Math.abs(back.v - 0.75)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
  });
});

describe("degenerate rectangles", () => {
  const O = v3(0, 0, 0);
  const U = v3(1, 2, 3);
  it.each<[string, PlanarZoneRect]>([
    ["zero uAxis", { origin: O, uAxis: v3(0, 0, 0), vAxis: v3(0, 1, 0) }],
    ["zero vAxis", { origin: O, uAxis: v3(1, 0, 0), vAxis: v3(0, 0, 0) }],
    ["parallel vAxis = 2·uAxis", { origin: O, uAxis: U, vAxis: scale(U, 2) }],
    ["antiparallel vAxis = −uAxis", { origin: O, uAxis: U, vAxis: scale(U, -1) }],
    ["near-parallel", { origin: O, uAxis: v3(1, 0, 0), vAxis: v3(1, 1e-9, 0) }],
    ["origin y: Infinity", { ...SKY, origin: v3(-3, Infinity, -5) }],
    ["uAxis z: NaN", { ...SKY, uAxis: v3(6, 0, NaN) }],
  ])("PD1 %s throws RangeError in all three functions", (_name, r) => {
    expect(() => planarCoordToWorld(pc(0.5, 0.5), r)).toThrow(RangeError);
    expect(() => worldToPlanarCoord(v3(0, 0, 0), r)).toThrow(RangeError);
    expect(() => planarSurfaceNormal(r)).toThrow(RangeError);
  });
  it("PD2 a thin but valid rect (sine ≈ 1e-3) does not throw", () => {
    const r: PlanarZoneRect = { origin: O, uAxis: v3(1, 0, 0), vAxis: v3(1, 1e-3, 0) };
    expect(() => planarCoordToWorld(pc(0.5, 0.5), r)).not.toThrow();
    expect(() => worldToPlanarCoord(v3(0, 0, 0), r)).not.toThrow();
    expect(() => planarSurfaceNormal(r)).not.toThrow();
  });
});

describe("planarSurfaceNormal", () => {
  it("PN1 is unit length for every random rect", () => {
    for (const rect of RECTS) expect(Math.abs(norm(planarSurfaceNormal(rect)) - 1)).toBeLessThanOrEqual(NORMAL_TOL);
  });
  it("PN2 is perpendicular to both axes", () => {
    for (const rect of RECTS) {
      const n = planarSurfaceNormal(rect);
      expect(Math.abs(dot(n, rect.uAxis)) / norm(rect.uAxis)).toBeLessThanOrEqual(NORMAL_TOL);
      expect(Math.abs(dot(n, rect.vAxis)) / norm(rect.vAxis)).toBeLessThanOrEqual(NORMAL_TOL);
    }
  });
  it("PN3 known values and right-handed orientation", () => {
    expectVecClose(planarSurfaceNormal(SKY), v3(0, 0, 1), 1e-12);
    expectVecClose(planarSurfaceNormal({ ...SKY, uAxis: SKY.vAxis, vAxis: SKY.uAxis }), v3(0, 0, -1), 1e-12);
    for (const rect of RECTS) expect(dot(planarSurfaceNormal(rect), cross(rect.uAxis, rect.vAxis))).toBeGreaterThan(0);
  });
  it("PN4 accepts a frozen rect and returns a fresh {x, y, z}", () => {
    const rect = freezeRect(SKY);
    const a = planarSurfaceNormal(rect);
    const b = planarSurfaceNormal(rect);
    expect(a).not.toBe(b);
    expect(Object.keys(a).sort()).toEqual(["x", "y", "z"]);
  });
});

describe("no three import", () => {
  it("NT1 PlanarGridCoord.ts imports no three / R3F / spring module", () => {
    const src = readFileSync(new URL("./PlanarGridCoord.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from\s+["'](three|@react-three\/|@react-spring\/)/);
    expect(src).not.toMatch(/import\(\s*["']three/);
  });
});
