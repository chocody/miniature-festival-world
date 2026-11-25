// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LOY_KRATHONG_RIVER_CHANNEL,
  LOY_KRATHONG_RIVER_ENVIRONMENT,
  RIVER_BANK_PROFILE,
  RIVER_WATER_SURFACE_Y,
} from "@/config/events/loyKrathong.river.config";
import { assertBankProfile, bankSurfaceY, buildBankProfileGeometryData, type BankGeometryData } from "./bankProfile";
import { createRiverChannel } from "./riverEnvironment";

const STRAIGHT = createRiverChannel({
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ],
  width: 4,
});
const PRODUCT = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL);
const BANK_WIDTH = LOY_KRATHONG_RIVER_ENVIRONMENT.bankWidth;

function faceNormalsY(d: BankGeometryData): number[] {
  const v = (i: number) => [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]];
  const out: number[] = [];
  for (let t = 0; t < d.indices.length; t += 3) {
    const [a, b, c] = [v(d.indices[t]), v(d.indices[t + 1]), v(d.indices[t + 2])];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    out.push(ab[2] * ac[0] - ab[0] * ac[2]); // cross.y
  }
  return out;
}

describe("assertBankProfile", () => {
  it("accepts the product profile", () => {
    expect(() => assertBankProfile(RIVER_BANK_PROFILE, BANK_WIDTH, RIVER_WATER_SURFACE_Y)).not.toThrow();
  });
  it("rejects bad profiles", () => {
    const ok = [
      { offset: 0, y: -0.3 },
      { offset: 1, y: 0 },
    ];
    expect(() => assertBankProfile([ok[0]], 1, -0.24)).toThrow(RangeError);
    expect(() => assertBankProfile([ok[1], ok[0]], 1, -0.24)).toThrow(RangeError); // unsorted
    expect(() => assertBankProfile([{ offset: 0, y: -0.3 }, { offset: 0, y: 0 }, { offset: 1, y: 0 }], 1, -0.24)).toThrow(RangeError);
    expect(() => assertBankProfile([{ offset: 0.1, y: -0.3 }, ok[1]], 1, -0.24)).toThrow(RangeError); // first ≠ 0
    expect(() => assertBankProfile(ok, 2, -0.24)).toThrow(RangeError); // last ≠ bankWidth
    expect(() => assertBankProfile([{ offset: 0, y: -0.24 }, ok[1]], 1, -0.24)).toThrow(RangeError); // first y ≥ water
    expect(() => assertBankProfile([{ offset: 0, y: Number.NaN }, ok[1]], 1, -0.24)).toThrow(RangeError);
    expect(() => assertBankProfile([ok[0], { offset: Number.NaN, y: 0 }], 1, -0.24)).toThrow(RangeError);
  });
});

describe("bankSurfaceY", () => {
  it("clamps at the ends and interpolates linearly", () => {
    expect(bankSurfaceY(RIVER_BANK_PROFILE, -1)).toBe(RIVER_BANK_PROFILE[0].y);
    expect(bankSurfaceY(RIVER_BANK_PROFILE, 0)).toBe(RIVER_BANK_PROFILE[0].y);
    expect(bankSurfaceY(RIVER_BANK_PROFILE, 0.05)).toBeCloseTo(-0.215, 9);
    expect(bankSurfaceY(RIVER_BANK_PROFILE, 2)).toBeCloseTo(LOY_KRATHONG_RIVER_ENVIRONMENT.bankTopY, 9);
    expect(bankSurfaceY(RIVER_BANK_PROFILE, 99)).toBe(RIVER_BANK_PROFILE.at(-1)!.y);
    expect(() => bankSurfaceY(RIVER_BANK_PROFILE, Number.NaN)).toThrow(RangeError);
  });
});

describe("buildBankProfileGeometryData", () => {
  it("has (n + 1) rows of K vertices, every face pointing up, on both sides and both channels", () => {
    const K = RIVER_BANK_PROFILE.length;
    for (const channel of [STRAIGHT, PRODUCT]) {
      for (const side of [-1, 1] as const) {
        const n = 12;
        const d = buildBankProfileGeometryData(channel, side, RIVER_BANK_PROFILE, n);
        expect(d.rowSize).toBe(K);
        expect(d.vertexCount).toBe((n + 1) * K);
        expect(d.positions).toHaveLength(d.vertexCount * 3);
        expect(d.indices).toHaveLength(n * (K - 1) * 6);
        for (const y of faceNormalsY(d)) expect(y).toBeGreaterThan(0);
      }
    }
  });
  it("the k = 0 vertex sits on the water edge ±W/2 and every vertex at its profile height", () => {
    const right = buildBankProfileGeometryData(STRAIGHT, 1, RIVER_BANK_PROFILE, 4);
    const left = buildBankProfileGeometryData(STRAIGHT, -1, RIVER_BANK_PROFILE, 4);
    const K = RIVER_BANK_PROFILE.length;
    for (let i = 0; i <= 4; i++) {
      expect(right.positions[i * K * 3 + 2]).toBeCloseTo(2, 5);
      expect(left.positions[i * K * 3 + 2]).toBeCloseTo(-2, 5);
      RIVER_BANK_PROFILE.forEach((p, k) => {
        expect(right.positions[(i * K + k) * 3 + 1]).toBeCloseTo(p.y, 6);
        expect(right.positions[(i * K + k) * 3 + 2]).toBeCloseTo(2 + p.offset, 5);
        expect(left.positions[(i * K + k) * 3 + 2]).toBeCloseTo(-2 - p.offset, 5);
      });
    }
  });
  it("rejects bad input", () => {
    expect(() => buildBankProfileGeometryData(STRAIGHT, 1, RIVER_BANK_PROFILE, 0)).toThrow(RangeError);
    expect(() => buildBankProfileGeometryData(STRAIGHT, 1, RIVER_BANK_PROFILE, 1.5)).toThrow(RangeError);
    expect(() => buildBankProfileGeometryData(STRAIGHT, 0 as 1, RIVER_BANK_PROFILE, 4)).toThrow(RangeError);
  });
});
