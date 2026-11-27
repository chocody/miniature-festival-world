import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { walkToWorld } from "./helpers/ownKrathongPopup";
import {
  E2E_PINNED_TIER_URL,
  E2E_SKY_LANTERN_NAME,
  installSceneProbe,
  locateStableTarget,
  sceneObjectVisible,
  waitForCameraRest,
  waitForKrathongModels,
} from "./helpers/sceneProbe";

/**
 * MFW-85 X85: before / after screenshots of the world HUD with the sky launch switch, at phone and desktop size (HIGH tier).
 * Opt-in (`MFW_SCREENSHOTS=1`); `MFW_SCREENSHOT_PHASE` names the files ("before" | "after"). The before phase uses only selectors
 * that exist before the card. `MFW_SCREENSHOT_PRESET=DAY` is a review-only variant (files get a `-day` suffix; not committed).
 */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
const LANTERN_SHOT_MS = 900;

const phase = process.env.MFW_SCREENSHOT_PHASE === "before" ? "before" : "after";
const preset = process.env.MFW_SCREENSHOT_PRESET === "DAY" ? "DAY" : "NIGHT";

test.skip(process.env.MFW_SCREENSHOTS !== "1", "screenshot run only");
test.use({ timezoneId: "Asia/Bangkok", hasTouch: true });

const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const size of SIZES) {
  test(`X85 ${size.name} sky launch switch`, async ({ page }, testInfo) => {
    test.slow(); // SwiftShader
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key as string, value as string);
        Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
      },
      [LIGHT_PRESET_STORAGE_KEY, preset] as const,
    );
    await installSceneProbe(page);
    await mockCreateCreation(page);
    await page.goto(E2E_PINNED_TIER_URL);
    await walkToWorld(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await waitForCameraRest(page);
    await waitForKrathongModels(page);
    const suffix = preset === "DAY" ? "-day" : "-night";
    await shoot(page, testInfo, `${phase}-${size.name}${suffix}`);

    if (phase === "after") {
      const sw = page.getByTestId("sky-launch-switch");
      await sw.click();
      await expect(sw).toHaveAttribute("data-sky-launch", "skyLantern");
      await waitForCameraRest(page);
      const sky = await locateStableTarget(page, "sky");
      await page.touchscreen.tap(sky.x, sky.y);
      await expect(scene(page)).toHaveAttribute("data-last-gimmick", "sky-lantern");
      await expect.poll(() => sceneObjectVisible(page, E2E_SKY_LANTERN_NAME)).toBe(true);
      await page.waitForTimeout(LANTERN_SHOT_MS);
      await shoot(page, testInfo, `after-${size.name}${suffix}-sky-lantern`);
    }
  });
}
