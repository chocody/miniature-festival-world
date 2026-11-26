// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeGrowingWorld } from "./growingWorldScaler";

describe("describeGrowingWorld", () => {
  it("returns null without a visible zone", () => {
    expect(describeGrowingWorld(null, null)).toBeNull();
    expect(describeGrowingWorld(3, null)).toBeNull();
  });
  it("gives neighbours, frozen", () => {
    const v = describeGrowingWorld(3, 2);
    expect(v).toEqual({ zoneCount: 3, visibleZoneId: 2, upstreamZoneId: 1, downstreamZoneId: 3 });
    expect(Object.isFrozen(v)).toBe(true);
  });
  it("edges wrap around (MFW-58, open question 37): after the last zone comes zone 1, before zone 1 the last", () => {
    expect(describeGrowingWorld(3, 1)?.upstreamZoneId).toBe(3);
    expect(describeGrowingWorld(3, 3)?.downstreamZoneId).toBe(1);
    expect(describeGrowingWorld(2, 2)).toMatchObject({ upstreamZoneId: 1, downstreamZoneId: 1 });
    expect(describeGrowingWorld(1, 1)).toMatchObject({ upstreamZoneId: null, downstreamZoneId: null });
    expect(describeGrowingWorld(null, 1)).toMatchObject({ upstreamZoneId: null, downstreamZoneId: null });
  });
  it("derives the count", () => {
    expect(describeGrowingWorld(null, 1)?.zoneCount).toBe(1);
    expect(describeGrowingWorld(2, 5)).toMatchObject({ zoneCount: 5, downstreamZoneId: 1, upstreamZoneId: 4 });
  });
  it("throws on invalid input", () => {
    expect(() => describeGrowingWorld(3, 0)).toThrow(RangeError);
    expect(() => describeGrowingWorld(3, 1.5)).toThrow(RangeError);
    expect(() => describeGrowingWorld(0, 1)).toThrow(RangeError);
  });
});
