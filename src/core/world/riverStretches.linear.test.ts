import { describe, expect, it } from "vitest";
import {
  LINEAR_ZONE_ANCHOR,
  ZONE_TOPOLOGIES,
  clampLinearZone,
  linearStreamedZoneIds,
  linearZoneCount,
  zoneIdForStretch,
} from "./riverStretches";

describe("linear zone window (MFW-99)", () => {
  it("LW1 window inside the range", () => {
    expect(linearStreamedZoneIds(5, 9, 2)).toEqual([5, 4, 6, 3, 7]);
    expect(linearStreamedZoneIds(4, 9, 0)).toEqual([4]);
  });

  it("LW2 no wrap at the ends", () => {
    expect(linearStreamedZoneIds(1, 9, 2)).toEqual([1, 2, 3]);
    expect(linearStreamedZoneIds(9, 9, 2)).toEqual([9, 8, 7]);
    expect(linearStreamedZoneIds(2, 3, 2)).toEqual([2, 1, 3]);
    expect(linearStreamedZoneIds(1, 1, 2)).toEqual([1]);
    expect(linearStreamedZoneIds(1, null, 2)).toEqual([1]);
  });

  it("LW3 current zone beyond the count", () => {
    expect(linearStreamedZoneIds(6, 5, 2)).toEqual([6, 5, 4]);
    expect(linearZoneCount(5, 6)).toBe(6);
    expect(linearZoneCount(6, 3)).toBe(6);
    expect(linearZoneCount(null, 1)).toBe(1);
  });

  it("LW4 property: bounded window, no ring wrap (invariant E)", () => {
    for (let b = 1; b <= 12; b++) {
      for (let n = 1; n <= 12; n++) {
        for (let r = 0; r <= 3; r++) {
          const ids = linearStreamedZoneIds(b, n, r);
          const top = Math.max(n, b);
          expect(Object.isFrozen(ids)).toBe(true);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.length).toBeLessThanOrEqual(2 * r + 1);
          expect(ids[0]).toBe(b);
          for (const id of ids) {
            expect(id).toBeGreaterThanOrEqual(1);
            expect(id).toBeLessThanOrEqual(top);
            expect(Math.abs(id - b)).toBeLessThanOrEqual(r);
          }
        }
      }
    }
    const first = linearStreamedZoneIds(1, 9, 2);
    expect(first).not.toContain(8);
    expect(first).not.toContain(9);
  });

  it("LW5 clamp", () => {
    expect(clampLinearZone(0, 5)).toBe(1);
    expect(clampLinearZone(-3, 5)).toBe(1);
    expect(clampLinearZone(6, 5)).toBe(5);
    expect(clampLinearZone(3, 5)).toBe(3);
  });

  it("LW6 RangeError on bad input", () => {
    expect(() => linearStreamedZoneIds(0, 5, 1)).toThrow(RangeError);
    expect(() => linearStreamedZoneIds(1.5, 5, 1)).toThrow(RangeError);
    expect(() => linearStreamedZoneIds(2, 5, -1)).toThrow(RangeError);
    expect(() => linearStreamedZoneIds(2, 0, 1)).toThrow(RangeError);
    expect(() => linearZoneCount(0, 1)).toThrow(RangeError);
    expect(() => clampLinearZone(1, 0)).toThrow(RangeError);
    expect(() => clampLinearZone(0.5, 5)).toThrow(RangeError);
  });

  it("LW7 identity anchor", () => {
    expect(LINEAR_ZONE_ANCHOR).toEqual({ stretchIndex: 1, zoneId: 1 });
    expect(Object.isFrozen(LINEAR_ZONE_ANCHOR)).toBe(true);
    for (let n = 1; n <= 6; n++) {
      for (let b = 1; b <= n; b++) expect(zoneIdForStretch(b, LINEAR_ZONE_ANCHOR, n)).toBe(b);
    }
    expect(ZONE_TOPOLOGIES).toEqual(["ring", "linear"]);
    expect(Object.isFrozen(ZONE_TOPOLOGIES)).toBe(true);
  });
});
