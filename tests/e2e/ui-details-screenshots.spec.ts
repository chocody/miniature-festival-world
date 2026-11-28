import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { openCustomizer } from "./helpers/activeEvent";
import { lowTier } from "./helpers/ownKrathongPopup";
import { E2E_PINNED_TIER_URL, installSceneProbe } from "./helpers/sceneProbe";
import { WISH_SUBMIT_LABEL, WISH_SWITCH_LABEL, WISH_TEXT_LABEL } from "./helpers/wishStep";

/** MFW-83: before / after screenshots (DAY and NIGHT) of the design bar, the wish switch (off and on) and the world view. No assertions beyond the flow. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SIZES = [
  { name: "phone", width: 390, height: 844, world: true },
  { name: "small", width: 360, height: 640, world: false },
  { name: "desktop", width: 1440, height: 900, world: false },
] as const;

test.use({ timezoneId: "Asia/Bangkok", hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");

for (const size of SIZES) {
  for (const preset of ["DAY", "NIGHT"] as const) {
    test(`X83 ${size.name} ${preset}`, async ({ page }, testInfo) => {
      const shot = async (name: string) => {
        const path = testInfo.outputPath(`${name}-${size.name}-${preset.toLowerCase()}.png`);
        await page.screenshot({ path });
        await testInfo.attach(`${name}-${size.name}-${preset.toLowerCase()}`, { path, contentType: "image/png" });
      };
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        [LIGHT_PRESET_STORAGE_KEY, preset] as const,
      );
      await lowTier(page);
      await mockCreateCreation(page, { zoneId: 1 });
      await installSceneProbe(page);
      await page.goto(E2E_PINNED_TIER_URL);
      await openCustomizer(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
      await shot("customize");

      await page.getByRole("button", { name: "ถัดไป" }).tap();
      await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill("ขอให้ทุกคนมีความสุข");
      await shot("wish-off");
      await page.getByRole("switch", { name: WISH_SWITCH_LABEL }).tap();
      await shot("wish-on");
      if (!size.world) return;
      await page.getByRole("switch", { name: WISH_SWITCH_LABEL }).tap();
      await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).tap();
      await page.getByRole("button", { name: "ปล่อยกระทง" }).tap();
      await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE", { timeout: 20_000 });
      await shot("world");
    });
  }
}
