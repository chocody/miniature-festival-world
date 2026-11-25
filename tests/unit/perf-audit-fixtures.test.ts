// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  PERF_PROBE_GLOBAL_NAME,
  PERF_PROBE_QUERY_PARAM,
  PERF_PROBE_QUERY_VALUE,
  PERF_SOAK_DWELL_MS,
  PERF_SOAK_SWITCHES,
  PERF_SOAK_ZONE_COUNT,
} from "@/config/perfProbe.config";
import {
  E2E_PERF_PROBE_GLOBAL,
  E2E_PERF_PROBE_QUERY,
  E2E_SOAK_DWELL_MS,
  E2E_SOAK_SWITCHES,
  E2E_SOAK_ZONE_COUNT,
} from "../e2e/fixtures/perfAudit";

describe("e2e perf-audit constants equal the src constants", () => {
  it("matches", () => {
    expect(E2E_PERF_PROBE_QUERY).toBe(`?${PERF_PROBE_QUERY_PARAM}=${PERF_PROBE_QUERY_VALUE}`);
    expect(E2E_PERF_PROBE_GLOBAL).toBe(PERF_PROBE_GLOBAL_NAME);
    expect(E2E_SOAK_ZONE_COUNT).toBe(PERF_SOAK_ZONE_COUNT);
    expect(E2E_SOAK_SWITCHES).toBe(PERF_SOAK_SWITCHES);
    expect(E2E_SOAK_DWELL_MS).toBe(PERF_SOAK_DWELL_MS);
  });
});
