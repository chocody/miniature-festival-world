import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATION_ID, mockCreateCreation } from "./fixtures/ritualRoutes";
import { makeOwnZoneItem } from "./fixtures/findMyFixtures";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { openCustomizer } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";
import { E2E_PINNED_TIER_URL, installSceneProbe, waitForCameraRest } from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

/** MFW-74 X1: before / after screenshots of the world HUD. Uses only selectors that exist before and after the card. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
/** MFW-79: `E2E_SCREENSHOT_DEVICE=high` captures the HIGH tier; the default keeps the earlier 4 / 4 device. */
const DEFAULT_DEVICE = { memory: 4, cores: 4 } as const;
const HIGH_DEVICE = { memory: 8, cores: 8 } as const;
const DEVICE = process.env.E2E_SCREENSHOT_DEVICE === "high" ? HIGH_DEVICE : DEFAULT_DEVICE;

test.use({ timezoneId: "Asia/Bangkok" });

async function walkToWorld(page: Page, preset: "DAY" | "NIGHT") {
  await page.addInitScript(
    ([key, value, memory, cores]) => {
      localStorage.setItem(key, value);
      Object.defineProperty(navigator, "deviceMemory", { get: () => memory, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => cores, configurable: true });
    },
    [LIGHT_PRESET_STORAGE_KEY, preset, DEVICE.memory, DEVICE.cores] as const,
  );
  await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }));
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      const body = makeZoneBody(1, 3);
      body.items.push(makeOwnZoneItem(1, E2E_CREATION_ID, Date.now()));
      return route.fulfill({ json: body });
    },
  );
  await mockCreateCreation(page, { zoneId: 1 });
  await installSceneProbe(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page); // the release flight has landed
}

for (const size of SIZES) {
  for (const preset of ["DAY", "NIGHT"] as const) {
    test(`X1 ${size.name} ${preset}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await walkToWorld(page, preset);
      const path = testInfo.outputPath(`hud-${size.name}-${preset.toLowerCase()}.png`);
      await page.screenshot({ path });
      await testInfo.attach(`hud-${size.name}-${preset.toLowerCase()}`, { path, contentType: "image/png" });
    });
  }
}
