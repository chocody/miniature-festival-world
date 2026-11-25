export const E2E_PERF_PROBE_QUERY = "?perfProbe=1"; // = `?${PERF_PROBE_QUERY_PARAM}=${PERF_PROBE_QUERY_VALUE}`
export const E2E_PERF_PROBE_GLOBAL = "__MFW_PERF_PROBE__"; // = PERF_PROBE_GLOBAL_NAME
export const E2E_SOAK_ZONE_COUNT = 2; // = PERF_SOAK_ZONE_COUNT
export const E2E_SOAK_SWITCHES = 20; // = PERF_SOAK_SWITCHES
export const E2E_SOAK_DWELL_MS = 1_000; // = PERF_SOAK_DWELL_MS
/** Test-only tolerances (lead decision, MFW-34). Do not raise them to make a run pass; report instead. */
export const E2E_ZONE_SWITCH_CYCLES = 5; // × 4 switches per cycle = 20 switches
export const E2E_MAX_HEAP_GROWTH_BYTES = 2 * 1_048_576;
export const E2E_SOAK_MARGIN_MS = 30_000;
export const E2E_PERF_TEST_TIMEOUT_MS = 180_000;
export const PERF_AUDIT_RECORD_ONLY_ENV = "PERF_AUDIT_RECORD_ONLY";
