/*
 * MFW-58 endless-river e2e literals. Mirrors of app strings (tests/unit/endless-river-e2e-literals.test.ts pins them to
 * ZONE_NAV_COPY) plus test-only technical numbers.
 */
export const E2E_ZONE_LABEL = (zoneId: number, zoneCount: number) => `คุ้งน้ำที่ ${zoneId} จาก ${zoneCount}`; // = ZONE_NAV_COPY.zoneLabel
export const E2E_NEXT_ZONE_NAME = "คุ้งน้ำถัดไป"; // = ZONE_NAV_COPY.downstream
export const E2E_PREVIOUS_ZONE_NAME = "คุ้งน้ำก่อนหน้า"; // = ZONE_NAV_COPY.upstream
/** Technical (test only): drags needed to pass one seam are ≈ 6 at 360 px (0.6 × width each); 8 leaves margin, never more. */
export const E2E_MAX_TRAVEL_DRAGS = 8;
export const E2E_TRAVEL_DRAG_FRACTION = 0.6;
/** Technical (test only): navigator jumps of the memory soak (E4). */
export const E2E_TRAVEL_JUMPS = 12;
