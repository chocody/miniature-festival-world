/*
 * MFW-58 endless-river e2e literals. Mirrors of app strings (tests/unit/endless-river-e2e-literals.test.ts pins them to
 * ZONE_NAV_COPY) plus test-only technical numbers.
 */
export const E2E_NEXT_ZONE_NAME = "คุ้งน้ำถัดไป"; // = ZONE_NAV_COPY.downstream
export const E2E_PREVIOUS_ZONE_NAME = "คุ้งน้ำก่อนหน้า"; // = ZONE_NAV_COPY.upstream
/** Technical (test only): drags needed to pass one seam are ≈ 6 at 360 px (0.6 × width each); 8 leaves margin, never more. */
export const E2E_MAX_TRAVEL_DRAGS = 8;
export const E2E_TRAVEL_DRAG_FRACTION = 0.6;
/**
 * Test timeout for the HIGH drag-travel tests (E1, E3). Each drag waits for the camera to rest, and a HIGH frame with two
 * stretches on screen costs ≈ 250 ms on SwiftShader: E1 measured 18–19 s alone and 24–27 s beside a second Playwright
 * worker (the default on a 4-core runner), against Playwright's default 30 s. Measured in the MFW-71 verify repair,
 * 2026-11-26. Assertions are unchanged; only the time allowed to reach them.
 */
export const E2E_TRAVEL_TEST_TIMEOUT_MS = 60_000;
/** Technical (test only): navigator jumps of the memory soak (E4). */
export const E2E_TRAVEL_JUMPS = 12;
