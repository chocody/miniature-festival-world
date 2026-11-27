// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  cylindricalCoordToWorld,
  cylindricalSurfaceNormal,
  worldToCylindricalCoord,
  type CylindricalTierGeometry,
  type NormalizedCylindricalCoord,
} from "./CylindricalCoord";
import type { WorldVec3 } from "./types";
import { parsePersistableCoord } from "./validateCoord";

const TIER: CylindricalTierGeometry = { tierId: 0, baseY: 2, height: 3, bottomRadius: 1.5, topRadius: 0.9 };
const coord = (angleDeg: number, heightRatio: number, tierId = 0): NormalizedCylindricalCoord => ({
  mode: "CYLINDRICAL_SURFACE",
  tierId,
  angleDeg,
  heightRatio,
});

describe("cylindricalCoordToWorld (spec §4.2)", () => {
  it("angle 0 at the bottom is the front: (0, baseY, R_bottom)", () => {
    const w = cylindricalCoordToWorld(coord(0, 0), TIER);
    expect(w.x).toBeCloseTo(0, 12);
    expect(w.y).toBe(TIER.baseY);
    expect(w.z).toBeCloseTo(TIER.bottomRadius, 12);
  });
  it("angle 90 at the top is the right side: (R_top, baseY + H, 0)", () => {
    const w = cylindricalCoordToWorld(coord(90, 1), TIER);
    expect(w.x).toBeCloseTo(TIER.topRadius, 12);
    expect(w.y).toBeCloseTo(TIER.baseY + TIER.height, 12);
    expect(w.z).toBeCloseTo(0, 12);
  });
  it("angle 180 is the back", () => {
    expect(cylindricalCoordToWorld(coord(180, 0), TIER).z).toBeCloseTo(-TIER.bottomRadius, 12);
  });
  it("interpolates the radius linearly", () => {
    const w = cylindricalCoordToWorld(coord(0, 0.5), TIER);
    expect(w.z).toBeCloseTo((TIER.bottomRadius + TIER.topRadius) / 2, 12);
  });
  it("rejects a tier mismatch and non-finite input", () => {
    expect(() => cylindricalCoordToWorld(coord(0, 0, 1), TIER)).toThrow(RangeError);
    expect(() => cylindricalCoordToWorld(coord(NaN, 0), TIER)).toThrow(RangeError);
    expect(() => cylindricalCoordToWorld(coord(0, 0), { ...TIER, height: Infinity })).toThrow(RangeError);
  });
  it("returns a new object each call", () => {
    expect(cylindricalCoordToWorld(coord(10, 0.2), TIER)).not.toBe(cylindricalCoordToWorld(coord(10, 0.2), TIER));
  });
});

// ---- MFW-94: inverse + surface normal ----

const forward = cylindricalCoordToWorld;
const inverse = worldToCylindricalCoord;
const CONE0: CylindricalTierGeometry = { tierId: 3, baseY: 10, height: 1, bottomRadius: 1, topRadius: 0 };
const ROUND_TRIP_TOL = 1e-9;
const NORMAL_TOL = 1e-12;

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

const range = (rng: () => number, min: number, max: number) => min + (max - min) * rng();

function randomTier(rng: () => number, i: number): CylindricalTierGeometry {
  const tierId = Math.floor(rng() * 501);
  const baseY = range(rng, -10, 1000);
  const height = range(rng, 0.1, 5);
  const bottomRadius = range(rng, 0, 3);
  let topRadius = range(rng, 0, 3);
  if (i % 10 === 0) topRadius = 0;
  if (i % 10 === 5) topRadius = bottomRadius;
  return { tierId, baseY, height, bottomRadius, topRadius };
}

const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
const radiusAt = (tier: CylindricalTierGeometry, h: number) => tier.bottomRadius + (tier.topRadius - tier.bottomRadius) * h;
const dot = (p: WorldVec3, q: WorldVec3) => p.x * q.x + p.y * q.y + p.z * q.z;
const norm = (p: WorldVec3) => Math.hypot(p.x, p.y, p.z);
const sub = (p: WorldVec3, q: WorldVec3): WorldVec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const unit = (p: WorldVec3): WorldVec3 => {
  const l = norm(p);
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};

interface Sample {
  readonly tier: CylindricalTierGeometry;
  readonly c: NormalizedCylindricalCoord;
}

const EDGE_ANGLES = [0, 90, 180, 270, 359.999];
const EDGE_HEIGHTS = [0, 0.5, 1];

function buildSamples(): { readonly samples: readonly Sample[]; readonly randomSamples: readonly Sample[] } {
  const rng = mulberry32(0x5eed94);
  const samples: Sample[] = [];
  const randomSamples: Sample[] = [];
  for (let i = 0; i < 200; i++) {
    const tier = randomTier(rng, i);
    for (let k = 0; k < 25; k++) {
      const s = { tier, c: coord(rng() * 360, rng(), tier.tierId) };
      samples.push(s);
      randomSamples.push(s);
    }
    for (const a of EDGE_ANGLES) for (const h of EDGE_HEIGHTS) samples.push({ tier, c: coord(a, h, tier.tierId) });
  }
  return { samples, randomSamples };
}
const { samples: SAMPLES, randomSamples: RANDOM_SAMPLES } = buildSamples();

describe("worldToCylindricalCoord", () => {
  it("CI1: inverts the front bottom point to an exact persistable coord", () => {
    const result = inverse(forward(coord(0, 0), TIER), TIER);
    expect(result).toEqual({ mode: "CYLINDRICAL_SURFACE", tierId: 0, angleDeg: 0, heightRatio: 0 });
    expect(Object.keys(result!).sort()).toEqual(["angleDeg", "heightRatio", "mode", "tierId"]);
    expect(parsePersistableCoord(result).ok).toBe(true);
    expect(inverse({ x: 1.5, y: 2, z: 0 }, TIER)!.angleDeg).toBeCloseTo(90, 12);
  });

  it("CI2: wraps the angle into [0, 360)", () => {
    expect(inverse({ x: -TIER.bottomRadius, y: TIER.baseY, z: 0 }, TIER)!.angleDeg).toBeCloseTo(270, 12);
    const full = inverse(forward(coord(360, 0.3), TIER), TIER)!;
    expect(full.angleDeg).toBeGreaterThanOrEqual(0);
    expect(full.angleDeg).toBeLessThan(360);
    expect(angDiff(full.angleDeg, 0)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(inverse(forward(coord(765, 0.3), TIER), TIER)!.angleDeg - 45)).toBeLessThanOrEqual(1e-9);
    expect(inverse({ x: -1e-300, y: TIER.baseY, z: TIER.bottomRadius }, TIER)!.angleDeg).toBe(0);
  });

  it("CI3: clamps h to exactly 0 / 1 within the tolerance", () => {
    expect(inverse({ x: 0, y: TIER.baseY - 0.005, z: TIER.bottomRadius }, TIER, 0.01)!.heightRatio).toBe(0);
    expect(inverse({ x: 0, y: TIER.baseY + TIER.height + 0.005, z: TIER.topRadius }, TIER, 0.01)!.heightRatio).toBe(1);
    const top = inverse(forward(coord(30, 1), TIER), TIER)!;
    expect(top.heightRatio).toBeLessThanOrEqual(1);
    expect(Math.abs(top.heightRatio - 1)).toBeLessThanOrEqual(1e-12);
    expect(inverse(forward(coord(30, 0), TIER), TIER)!.heightRatio).toBe(0);
  });

  it("CI4: returns null off the surface", () => {
    const tol = 0.01;
    const rMid = radiusAt(TIER, 0.5);
    const yMid = TIER.baseY + TIER.height / 2;
    expect(inverse({ x: 0, y: TIER.baseY - 0.02, z: TIER.bottomRadius }, TIER, tol)).toBeNull();
    expect(inverse({ x: 0, y: TIER.baseY + TIER.height + 0.02, z: TIER.topRadius }, TIER, tol)).toBeNull();
    expect(inverse({ x: 0, y: yMid, z: rMid + 0.02 }, TIER, tol)).toBeNull();
    expect(inverse({ x: 0, y: yMid, z: rMid - 0.02 }, TIER, tol)).toBeNull();
    expect(inverse({ x: 0, y: yMid, z: 0 }, TIER, tol)).toBeNull();
    const p = forward(coord(40, 0.5), TIER);
    const hl = Math.hypot(p.x, p.z);
    const pushed = { x: p.x + (p.x / hl) * 1e-6, y: p.y, z: p.z + (p.z / hl) * 1e-6 };
    expect(inverse(pushed, TIER)).toBeNull();
  });

  it("CI5: handles a zero top radius (apex)", () => {
    expect(inverse({ x: 0, y: 11, z: 0 }, CONE0)).toEqual({
      mode: "CYLINDRICAL_SURFACE",
      tierId: 3,
      angleDeg: 0,
      heightRatio: 1,
    });
    const apex = inverse(forward(coord(123, 1, 3), CONE0), CONE0);
    expect(apex).not.toBeNull();
    expect(apex!.angleDeg).toBe(0);
    expect(Math.abs(apex!.heightRatio - 1)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(inverse(forward(coord(123, 0.5, 3), CONE0), CONE0)!.angleDeg - 123)).toBeLessThanOrEqual(1e-9);
  });

  it("CI6: throws RangeError on non-finite input, invalid tiers and invalid tolerance", () => {
    const hit = forward(coord(10, 0.5), TIER);
    expect(() => inverse({ ...hit, x: NaN }, TIER)).toThrow(RangeError);
    expect(() => inverse({ ...hit, y: Infinity }, TIER)).toThrow(RangeError);
    expect(() => inverse(hit, { ...TIER, height: 0 })).toThrow(RangeError);
    expect(() => inverse(hit, { ...TIER, height: -1 })).toThrow(RangeError);
    expect(() => inverse(hit, { ...TIER, bottomRadius: -0.1 })).toThrow(RangeError);
    expect(() => inverse(hit, { ...TIER, tierId: 1.5 })).toThrow(RangeError);
    expect(() => inverse(hit, TIER, -1)).toThrow(RangeError);
    expect(() => inverse(hit, TIER, NaN)).toThrow(RangeError);
  });

  it("CI7: does not mutate its inputs and returns a fresh object", () => {
    const hit = Object.freeze({ ...forward(coord(10, 0.5), TIER) });
    const tier = Object.freeze({ ...TIER });
    expect(() => inverse(hit, tier)).not.toThrow();
    expect(inverse(hit, tier)).not.toBe(inverse(hit, tier));
  });
});

describe("cylindrical round trip (tolerance 1e-9)", () => {
  it("RT1: forward(inverse(forward(c))) reproduces the world point", () => {
    for (const { tier, c } of SAMPLES) {
      const hit = forward(c, tier);
      const back = inverse(hit, tier);
      expect(back).not.toBeNull();
      const again = forward(back!, tier);
      expect(Math.abs(again.x - hit.x)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(Math.abs(again.y - hit.y)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(Math.abs(again.z - hit.z)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
    }
  });

  it("RT2: inverse(forward(c)) reproduces the coord where R(h) >= 0.1", () => {
    let checked = 0;
    for (const { tier, c } of SAMPLES) {
      if (radiusAt(tier, c.heightRatio) < 0.1) continue;
      checked++;
      const back = inverse(forward(c, tier), tier)!;
      expect(back.tierId).toBe(tier.tierId);
      expect(Math.abs(back.heightRatio - c.heightRatio)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(angDiff(back.angleDeg, c.angleDeg)).toBeLessThanOrEqual(ROUND_TRIP_TOL);
      expect(back.angleDeg).toBeGreaterThanOrEqual(0);
      expect(back.angleDeg).toBeLessThan(360);
      expect(back.heightRatio).toBeGreaterThanOrEqual(0);
      expect(back.heightRatio).toBeLessThanOrEqual(1);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("cylindricalSurfaceNormal", () => {
  it("SN1: is unit length", () => {
    for (const { tier, c } of RANDOM_SAMPLES) {
      expect(Math.abs(norm(cylindricalSurfaceNormal(c, tier)) - 1)).toBeLessThanOrEqual(NORMAL_TOL);
    }
  });

  it("SN2: is perpendicular to both surface tangents", () => {
    const EPS_H = 1e-6;
    const EPS_A = 1e-6;
    for (const { tier, c } of RANDOM_SAMPLES) {
      const n = cylindricalSurfaceNormal(c, tier);
      const a = (c.angleDeg * Math.PI) / 180;
      const dR = tier.topRadius - tier.bottomRadius;
      const tA = { x: Math.cos(a), y: 0, z: -Math.sin(a) };
      const tH = { x: dR * Math.sin(a), y: tier.height, z: dR * Math.cos(a) };
      expect(Math.abs(dot(n, tA))).toBeLessThanOrEqual(NORMAL_TOL);
      expect(Math.abs(dot(n, tH)) / norm(tH)).toBeLessThanOrEqual(NORMAL_TOL);
      const dH = unit(
        sub(
          forward(coord(c.angleDeg, c.heightRatio + EPS_H, tier.tierId), tier),
          forward(coord(c.angleDeg, c.heightRatio - EPS_H, tier.tierId), tier),
        ),
      );
      expect(Math.abs(dot(n, dH))).toBeLessThanOrEqual(1e-6);
      if (radiusAt(tier, c.heightRatio) >= 0.1) {
        const dA = unit(
          sub(
            forward(coord(c.angleDeg + EPS_A, c.heightRatio, tier.tierId), tier),
            forward(coord(c.angleDeg - EPS_A, c.heightRatio, tier.tierId), tier),
          ),
        );
        expect(Math.abs(dot(n, dA))).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it("SN3: points outward", () => {
    for (const { tier, c } of SAMPLES) {
      const a = (c.angleDeg * Math.PI) / 180;
      expect(dot(cylindricalSurfaceNormal(c, tier), { x: Math.sin(a), y: 0, z: Math.cos(a) })).toBeGreaterThan(0);
    }
  });

  it("SN4: matches known values", () => {
    const cyl: CylindricalTierGeometry = { tierId: 0, baseY: 0, height: 2, bottomRadius: 1, topRadius: 1 };
    const close = (v: WorldVec3, e: WorldVec3) => {
      expect(Math.abs(v.x - e.x)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(v.y - e.y)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(v.z - e.z)).toBeLessThanOrEqual(1e-12);
    };
    close(cylindricalSurfaceNormal(coord(0, 0.5), cyl), { x: 0, y: 0, z: 1 });
    close(cylindricalSurfaceNormal(coord(90, 0.5), cyl), { x: 1, y: 0, z: 0 });
    close(cylindricalSurfaceNormal(coord(0, 0.5, 3), CONE0), { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 });
    const inverted = { ...cyl, bottomRadius: 0.5, topRadius: 1.5 };
    expect(cylindricalSurfaceNormal(coord(0, 0.5), inverted).y).toBeLessThan(0);
  });

  it("SN5: is well defined at a zero-radius apex", () => {
    const apex = cylindricalSurfaceNormal(coord(77, 1, 3), CONE0);
    const base = cylindricalSurfaceNormal(coord(77, 0, 3), CONE0);
    expect([apex.x, apex.y, apex.z].every(Number.isFinite)).toBe(true);
    expect(Math.abs(norm(apex) - 1)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(apex.x - base.x)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(apex.y - base.y)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(apex.z - base.z)).toBeLessThanOrEqual(1e-12);
  });

  it("SN6: is equal at 0 and 360 degrees", () => {
    const n0 = cylindricalSurfaceNormal(coord(0, 0.4), TIER);
    const n360 = cylindricalSurfaceNormal(coord(360, 0.4), TIER);
    expect(Math.abs(n0.x - n360.x)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(n0.y - n360.y)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(n0.z - n360.z)).toBeLessThanOrEqual(1e-12);
  });

  it("SN7: throws RangeError on invalid input and returns a fresh object", () => {
    expect(() => cylindricalSurfaceNormal(coord(0, 0.5, 1), TIER)).toThrow(RangeError);
    expect(() => cylindricalSurfaceNormal(coord(NaN, 0.5), TIER)).toThrow(RangeError);
    expect(() => cylindricalSurfaceNormal(coord(0, Infinity), TIER)).toThrow(RangeError);
    expect(() => cylindricalSurfaceNormal(coord(0, 0.5), { ...TIER, height: 0 })).toThrow(RangeError);
    expect(cylindricalSurfaceNormal(coord(10, 0.5), TIER)).not.toBe(cylindricalSurfaceNormal(coord(10, 0.5), TIER));
  });
});

describe("no three import", () => {
  it("NT1: CylindricalCoord.ts does not import three, @react-three/* or @react-spring/*", () => {
    const src = readFileSync(new URL("./CylindricalCoord.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from\s+["'](three|@react-three\/|@react-spring\/)/);
    expect(src).not.toMatch(/import\(\s*["']three/);
  });
});
