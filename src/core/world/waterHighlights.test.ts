// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOY_KRATHONG_RIVER_CHANNEL, RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import { RIVER_DRIFT_SPEED_FACTOR } from "@/config/riverFlow.config";
import { createRiverChannel } from "./riverEnvironment";
import {
  buildRingFanData,
  buildShoreHighlightData,
  createGlintPoseOut,
  krathongRippleScale,
  waterGlintPoseInto,
  type VertexAlphaMeshData,
} from "./waterHighlights";

const PRODUCT = createRiverChannel(LOY_KRATHONG_RIVER_CHANNEL);
const STRAIGHT = createRiverChannel({
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ],
  width: 4,
});
const GLINT = RIVER_WATER_HIGHLIGHTS.glint;
const RIPPLE = RIVER_WATER_HIGHLIGHTS.ripple;

function faceNormalsY(d: VertexAlphaMeshData): number[] {
  const v = (i: number) => [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]];
  const out: number[] = [];
  for (let t = 0; t < d.indices.length; t += 3) {
    const [a, b, c] = [v(d.indices[t]), v(d.indices[t + 1]), v(d.indices[t + 2])];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    out.push(ab[2] * ac[0] - ab[0] * ac[2]);
  }
  return out;
}
const alpha = (d: VertexAlphaMeshData, i: number) => d.colors[i * 4 + 3];
const frac = (v: number) => v - Math.floor(v);

describe("buildShoreHighlightData", () => {
  it("alpha 0 at the inner edge, 1 at the channel edge; faces up; 4·(n + 1) vertices", () => {
    const n = 8;
    const d = buildShoreHighlightData(STRAIGHT, 0.5, n);
    expect(d.vertexCount).toBe(4 * (n + 1));
    for (const y of faceNormalsY(d)) expect(y).toBeGreaterThan(0);
    for (let i = 0; i < d.vertexCount; i++) {
      const z = Math.abs(d.positions[i * 3 + 2]);
      expect(d.positions[i * 3 + 1]).toBe(0);
      if (alpha(d, i) === 1) expect(z).toBeCloseTo(2, 5);
      else {
        expect(alpha(d, i)).toBe(0);
        expect(z).toBeCloseTo(1.5, 5);
      }
      expect([d.colors[i * 4], d.colors[i * 4 + 1], d.colors[i * 4 + 2]]).toEqual([1, 1, 1]);
    }
    const product = buildShoreHighlightData(PRODUCT, RIVER_WATER_HIGHLIGHTS.shore.bandWidth, 48);
    for (const y of faceNormalsY(product)) expect(y).toBeGreaterThan(0);
  });
  it("rejects bad input", () => {
    expect(() => buildShoreHighlightData(STRAIGHT, 0, 4)).toThrow(RangeError);
    expect(() => buildShoreHighlightData(STRAIGHT, 2, 4)).toThrow(RangeError);
    expect(() => buildShoreHighlightData(STRAIGHT, 0.5, 0)).toThrow(RangeError);
    expect(() => buildShoreHighlightData(STRAIGHT, 0.5, 2.5)).toThrow(RangeError);
  });
});

describe("buildRingFanData", () => {
  it("4·segments triangles, alpha 0/1/0 rings, facing up", () => {
    const d = buildRingFanData(RIPPLE);
    expect(d.indices.length / 3).toBe(4 * RIPPLE.segments);
    expect(d.vertexCount).toBe(3 * RIPPLE.segments);
    for (const y of faceNormalsY(d)) expect(y).toBeGreaterThan(0);
    const ratios = [RIPPLE.innerRatio, RIPPLE.peakRatio, 1];
    [0, 1, 0].forEach((a, k) => {
      for (let s = 0; s < RIPPLE.segments; s++) {
        const i = k * RIPPLE.segments + s;
        expect(alpha(d, i)).toBe(a);
        expect(Math.hypot(d.positions[i * 3], d.positions[i * 3 + 2])).toBeCloseTo(ratios[k], 6);
      }
    });
  });
  it("rejects bad specs", () => {
    expect(() => buildRingFanData({ ...RIPPLE, segments: 2 })).toThrow(RangeError);
    expect(() => buildRingFanData({ ...RIPPLE, segments: 4.5 })).toThrow(RangeError);
    expect(() => buildRingFanData({ ...RIPPLE, innerRatio: 0 })).toThrow(RangeError);
    expect(() => buildRingFanData({ ...RIPPLE, innerRatio: 0.9, peakRatio: 0.8 })).toThrow(RangeError);
    expect(() => buildRingFanData({ ...RIPPLE, peakRatio: 1 })).toThrow(RangeError);
  });
});

describe("waterGlintPoseInto", () => {
  it("is deterministic, near the banks, alternating sides, envelope in [0, 1]", () => {
    const count = 6;
    for (const t of [0, 1234, 98_765]) {
      for (let i = 0; i < count; i++) {
        const a = waterGlintPoseInto(i, count, t, GLINT, createGlintPoseOut());
        const b = waterGlintPoseInto(i, count, t, GLINT, createGlintPoseOut());
        expect(a).toEqual(b);
        expect(Math.sign(a.lateral)).toBe(i % 2 === 0 ? -1 : 1);
        expect(Math.abs(a.lateral)).toBeGreaterThanOrEqual(0.5 - GLINT.edgeInset - GLINT.edgeSpread - 1e-12);
        expect(Math.abs(a.lateral)).toBeLessThanOrEqual(0.5 - GLINT.edgeInset + 1e-12);
        expect(a.envelope).toBeGreaterThanOrEqual(0);
        expect(a.envelope).toBeLessThanOrEqual(1);
        expect(a.progress).toBeGreaterThanOrEqual(0);
        expect(a.progress).toBeLessThan(1);
      }
    }
  });
  it("drifts downstream at speedScale × the krathong drift speed", () => {
    const a = waterGlintPoseInto(3, 6, 0, GLINT, createGlintPoseOut()).progress;
    const b = waterGlintPoseInto(3, 6, 1000, GLINT, createGlintPoseOut()).progress;
    expect(frac(b - a)).toBeCloseTo(RIVER_DRIFT_SPEED_FACTOR * GLINT.speedScale, 9);
  });
  it("validates index and count and returns out", () => {
    const out = createGlintPoseOut();
    expect(waterGlintPoseInto(0, 1, 0, GLINT, out)).toBe(out);
    expect(() => waterGlintPoseInto(0, 0, 0, GLINT, out)).toThrow(RangeError);
    expect(() => waterGlintPoseInto(2, 2, 0, GLINT, out)).toThrow(RangeError);
    expect(() => waterGlintPoseInto(-1, 2, 0, GLINT, out)).toThrow(RangeError);
    expect(() => waterGlintPoseInto(0.5, 2, 0, GLINT, out)).toThrow(RangeError);
    expect(() => waterGlintPoseInto(0, 2, Number.NaN, GLINT, out)).toThrow(RangeError);
  });
});

describe("krathongRippleScale", () => {
  it("reduced motion: exactly the radius at any time", () => {
    for (const t of [0, 500, 1e6]) expect(krathongRippleScale(3, t, true, RIPPLE)).toBe(RIPPLE.radius);
  });
  it("motion on: a gentle pulse within ±pulseAmplitude that varies with time", () => {
    const values = [0, 300, 600, 900, 1200].map((t) => krathongRippleScale(1, t, false, RIPPLE));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(RIPPLE.radius * (1 - RIPPLE.pulseAmplitude) - 1e-12);
      expect(v).toBeLessThanOrEqual(RIPPLE.radius * (1 + RIPPLE.pulseAmplitude) + 1e-12);
    }
    expect(new Set(values.map((v) => v.toFixed(6))).size).toBeGreaterThan(1);
  });
});
