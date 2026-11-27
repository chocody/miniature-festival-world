import { expect, test, type Page } from "@playwright/test";
import { E2E_DESIGN_LABELS, mockMixedDesignZone } from "./fixtures/krathongModels";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { readHeroDesigns } from "./helpers/designProbe";
import { E2E_PINNED_TIER_URL, installSceneProbe, waitForCameraRest, waitForKrathongModels } from "./helpers/sceneProbe";
import { completeWishStep } from "./helpers/wishStep";

/**
 * MFW-78 X78: before / after screenshots of the customizer and the river (DAY and NIGHT). Uses only selectors that exist before
 * and after the card: the lotus tile is tapped only when it exists. Asserts only the flow state.
 */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.use({ timezoneId: "Asia/Bangkok", hasTouch: true });

const RELEASE_TIMEOUT_MS = 20_000;
const root = (page: Page) => page.locator("[data-flow-state]");

for (const size of SIZES) {
  for (const preset of ["DAY", "NIGHT"] as const) {
    test(`X78 ${size.name} ${preset}`, async ({ page }, testInfo) => {
      // Triple budget (90 s): on the 2-vCPU CI runner SwiftShader HIGH draws ≈ 1–2 FPS with multi-second stalls at 1440 × 900. PR #84 CI
      // (MFW-1, 2026-11-27): desktop hit the 30 s test timeout (30.0–30.4 s; the customize screenshot 7.1 s, the "ถัดไป" tap 14.5 s,
      // then the release and the camera rest); it took 16.8–24.5 s before the village and 25.1–27.8 s on MFW-77; phone 6.9–24.1 s.
      test.slow();
      const shot = async (name: string) => {
        const path = testInfo.outputPath(`${name}-${size.name}-${preset.toLowerCase()}.png`);
        await page.screenshot({ path });
        await testInfo.attach(`${name}-${size.name}-${preset.toLowerCase()}`, { path, contentType: "image/png" });
      };
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.addInitScript(
        ([key, value]) => {
          localStorage.setItem(key, value);
          Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
          Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
        },
        [LIGHT_PRESET_STORAGE_KEY, preset] as const,
      );
      await mockMixedDesignZone(page);
      await mockCreateCreation(page, { zoneId: 1 });
      await installSceneProbe(page);
      await page.goto(E2E_PINNED_TIER_URL);
      await waitForActiveEvent(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
      const lotus = page.getByRole("button", { name: E2E_DESIGN_LABELS.lotus_bud_01, exact: true });
      const picker = (await lotus.count()) > 0;
      if (picker) await lotus.tap();
      await waitForKrathongModels(page);
      if (picker) await expect.poll(() => readHeroDesigns(page)).toEqual(["lotus_bud_01"]);
      await shot("customize");

      await page.getByRole("button", { name: "ถัดไป" }).tap();
      await completeWishStep(page);
      await page.getByRole("button", { name: "ปล่อยกระทง" }).tap();
      // The release animation at 1440 × 900 on SwiftShader HIGH can take longer than the default 5 s.
      await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE", { timeout: RELEASE_TIMEOUT_MS });
      await waitForCameraRest(page);
      await waitForKrathongModels(page);
      await shot("river");
    });
  }
}
