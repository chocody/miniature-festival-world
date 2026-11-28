/** MFW-154 landing literals (Playwright never imports `src/`; tests/unit/landing-e2e-literals.test.ts pins them). */
export const E2E_START_CREATE_LABEL = "ลอยกระทง";
export const E2E_CANCEL_CREATE_LABEL = "กลับไปดูแม่น้ำ";
export const E2E_CHRISTMAS_START_CREATE_LABEL = "ประดับต้นคริสต์มาส";
/** World units: the landing camera equals the post-release / after-cancel camera within this (technical). */
export const E2E_FRAMING_TOLERANCE = 1e-3;
/** Pixels: the customizer hero framing centres the stretch origin within this (technical). */
export const E2E_CENTRE_TOLERANCE_PX = 1;
