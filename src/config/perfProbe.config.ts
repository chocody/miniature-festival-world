/**
 * Hidden diagnostics for the MFW-34 memory audit (backlog 8.2). Lead decisions (technical, not product numbers):
 * the probe is off unless the page URL has ?perfProbe=1, and it reads counters only (no creation data).
 */
export const PERF_PROBE_QUERY_PARAM = "perfProbe";
export const PERF_PROBE_QUERY_VALUE = "1";
/** window property of the automation hook (Playwright reads samples through it). */
export const PERF_PROBE_GLOBAL_NAME = "__MFW_PERF_PROBE__";
/** How often the panel refreshes its numbers for a human reader. */
export const PERF_PROBE_SAMPLE_INTERVAL_MS = 500;
/** Synthetic zones the soak alternates between (each holds ZONE_ITEM_CAP items). */
export const PERF_SOAK_ZONE_COUNT = 2;
/** Switches measured after the warm-up; a multiple of PERF_SOAK_ZONE_COUNT, so "after" shows the same zone as "before". */
export const PERF_SOAK_SWITCHES = 20;
/** Time each synthetic zone stays on screen before the next switch. */
export const PERF_SOAK_DWELL_MS = 1_000;
/** Soak items are laid out in rows across the one wide lane (lateralOffset values, inside LATERAL_OFFSET_RANGE). */
export const PERF_SOAK_LATERAL_OFFSETS: readonly number[] = Object.freeze([-0.3, 0, 0.3]);
/** Display unit for the JS heap. */
export const BYTES_PER_MEBIBYTE = 1_048_576;

/**
 * Test/diagnostic flag: with ?pinTier=1 the device profiler picks the initial tier as usual but does not watch FPS, so the
 * tier never steps down at runtime. Lead decision (technical, not a product number): e2e that prove
 * per-tier behaviour on CPU-rendered SwiftShader runners use it, because those runners render below the 20 FPS fallback
 * threshold. Opt-in through the URL only; it reads and stores nothing.
 */
export const TIER_PIN_QUERY_PARAM = "pinTier";
export const TIER_PIN_QUERY_VALUE = "1";
