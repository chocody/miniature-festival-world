import { expect, test } from "@playwright/test";
import { e2eAppearanceWithDesign } from "./fixtures/krathongModels";
import { routeWishSwitchWorld } from "./fixtures/wishSwitchRoutes";
import { lowTier, openFirstCreationPopup, walkToWorld } from "./helpers/ownKrathongPopup";
import { E2E_PINNED_TIER_URL, installSceneProbe } from "./helpers/sceneProbe";

/** MFW-81 X81: before / after screenshots of the own-krathong popup at phone size (DAY and NIGHT). Asserts only that the dialog is visible. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SETTLE_MS = 400;

test.use({ timezoneId: "Asia/Bangkok", hasTouch: true, viewport: { width: 390, height: 844 } });

for (const preset of ["DAY", "NIGHT"] as const) {
  test(`X81 phone ${preset}`, async ({ page }, testInfo) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [LIGHT_PRESET_STORAGE_KEY, preset] as const);
    await lowTier(page);
    await installSceneProbe(page);
    await routeWishSwitchWorld(page, { ownAppearance: e2eAppearanceWithDesign("naga_01") });
    await page.goto(E2E_PINNED_TIER_URL);
    await walkToWorld(page);
    const dialog = await openFirstCreationPopup(page);
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    const name = `own-popup-phone-${preset.toLowerCase()}`;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: "image/png" });
  });
}
