// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estimateServerClockOffsetMs } from "./serverClock";

describe("estimateServerClockOffsetMs", () => {
  const T = Date.parse("2026-11-24T12:00:05.000Z");
  it("uses the request midpoint", () => {
    expect(estimateServerClockOffsetMs("2026-11-24T12:00:10.000Z", T - 200, T + 200)).toBe(5000);
  });
  it("returns 0 for bad input", () => {
    expect(estimateServerClockOffsetMs("not a date", T, T)).toBe(0);
    expect(estimateServerClockOffsetMs("2026-11-24T12:00:10.000Z", NaN, T)).toBe(0);
  });
});
