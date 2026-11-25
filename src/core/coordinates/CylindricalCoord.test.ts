// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cylindricalCoordToWorld, type CylindricalTierGeometry, type NormalizedCylindricalCoord } from "./CylindricalCoord";

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
