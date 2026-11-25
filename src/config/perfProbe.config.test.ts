import { describe, expect, it } from "vitest";
import { LATERAL_OFFSET_RANGE } from "@/core/coordinates";
import { ZONE_ITEM_CAP } from "./world.config";
import {
  PERF_PROBE_SAMPLE_INTERVAL_MS,
  PERF_SOAK_DWELL_MS,
  PERF_SOAK_LATERAL_OFFSETS,
  PERF_SOAK_SWITCHES,
  PERF_SOAK_ZONE_COUNT,
} from "./perfProbe.config";

describe("perfProbe.config", () => {
  it("soak switches are a multiple of the zone count", () => {
    expect(Number.isSafeInteger(PERF_SOAK_SWITCHES)).toBe(true);
    expect(Number.isSafeInteger(PERF_SOAK_ZONE_COUNT)).toBe(true);
    expect(PERF_SOAK_ZONE_COUNT).toBeGreaterThanOrEqual(2);
    expect(PERF_SOAK_SWITCHES % PERF_SOAK_ZONE_COUNT).toBe(0);
  });
  it("dwell is longer than the sample interval", () => {
    expect(PERF_PROBE_SAMPLE_INTERVAL_MS).toBeGreaterThan(0);
    expect(PERF_SOAK_DWELL_MS).toBeGreaterThan(PERF_PROBE_SAMPLE_INTERVAL_MS);
  });
  it("lateral offsets are distinct and inside the lane range", () => {
    const [min, max] = LATERAL_OFFSET_RANGE;
    for (const v of PERF_SOAK_LATERAL_OFFSETS) {
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
    expect(new Set(PERF_SOAK_LATERAL_OFFSETS).size).toBe(PERF_SOAK_LATERAL_OFFSETS.length);
  });
  it("a full zone fits the grid", () => {
    const rows = PERF_SOAK_LATERAL_OFFSETS.length;
    expect(Math.ceil(ZONE_ITEM_CAP / rows) * rows).toBeGreaterThanOrEqual(ZONE_ITEM_CAP);
  });
});
