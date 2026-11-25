import { describe, expect, it } from "vitest";
import { buildBlobShadowFan } from "./blobShadow";

const SPECS = [
  { segments: 10, rings: 2, falloffExponent: 1.6 },
  { segments: 24, rings: 3, falloffExponent: 1.6 },
];

describe.each(SPECS)("buildBlobShadowFan(%o)", (spec) => {
  const fan = buildBlobShadowFan(spec);
  const ringOf = (v: number) => (v === 0 ? 0 : Math.floor((v - 1) / spec.segments) + 1);
  const alpha = (v: number) => fan.colors[v * 4 + 3];

  it("has the expected vertex and triangle counts", () => {
    expect(fan.vertexCount).toBe(1 + spec.rings * spec.segments);
    expect(fan.positions.length).toBe(fan.vertexCount * 3);
    expect(fan.colors.length).toBe(fan.vertexCount * 4);
    expect(fan.indices.length).toBe(3 * spec.segments * (2 * spec.rings - 1));
  });

  it("is a flat unit disc with centre alpha 1 and rim alpha 0, rgb 1", () => {
    for (let v = 0; v < fan.vertexCount; v++) {
      expect(fan.positions[v * 3 + 1]).toBe(0);
      expect([fan.colors[v * 4], fan.colors[v * 4 + 1], fan.colors[v * 4 + 2]]).toEqual([1, 1, 1]);
      if (ringOf(v) === spec.rings) {
        expect(Math.hypot(fan.positions[v * 3], fan.positions[v * 3 + 2])).toBeCloseTo(1, 6);
        expect(alpha(v)).toBe(0);
      }
    }
    expect(alpha(0)).toBe(1);
  });

  it("alpha never increases outward", () => {
    for (let v = 1; v < fan.vertexCount; v++) {
      const inner = ringOf(v) === 1 ? 0 : v - spec.segments;
      expect(alpha(v)).toBeLessThanOrEqual(alpha(inner));
    }
  });

  it("every triangle faces +y", () => {
    const p = (i: number) => [fan.positions[i * 3], fan.positions[i * 3 + 1], fan.positions[i * 3 + 2]];
    for (let t = 0; t < fan.indices.length; t += 3) {
      const [a, b, c] = [p(fan.indices[t]), p(fan.indices[t + 1]), p(fan.indices[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = u[2] * w[0] - u[0] * w[2];
      expect(ny).toBeGreaterThan(0);
    }
  });
});

describe("buildBlobShadowFan validation", () => {
  it.each([
    { segments: 2, rings: 2, falloffExponent: 1 },
    { segments: 8, rings: 0, falloffExponent: 1 },
    { segments: 8, rings: 2, falloffExponent: 0 },
    { segments: 8.5, rings: 2, falloffExponent: 1 },
    { segments: 8, rings: 2, falloffExponent: Number.NaN },
  ])("rejects %o", (spec) => {
    expect(() => buildBlobShadowFan(spec)).toThrow(RangeError);
  });
});
