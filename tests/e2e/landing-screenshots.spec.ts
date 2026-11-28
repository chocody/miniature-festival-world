import { expect, test, type Page } from "@playwright/test";
import { E2E_START_CREATE_LABEL } from "./fixtures/landingFixtures";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { waitForLanding } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL, installSceneProbe, waitForCameraRest } from "./helpers/sceneProbe";

/** MFW-154 X1: the landing (the shared world) and the customizer after the start button, DAY and NIGHT, phone and desktop. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
/** Same device as world-hud-screenshots.spec.ts (`E2E_SCREENSHOT_DEVICE=high` captures the HIGH tier). */
const DEFAULT_DEVICE = { memory: 4, cores: 4 } as const;
const HIGH_DEVICE = { memory: 8, cores: 8 } as const;
const DEVICE = process.env.E2E_SCREENSHOT_DEVICE === "high" ? HIGH_DEVICE : DEFAULT_DEVICE;

test.use({ timezoneId: "Asia/Bangkok" });

async function openLanding(page: Page, preset: "DAY" | "NIGHT") {
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
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ json: makeZoneBody(1, 3) });
    },
  );
  await mockCreateCreation(page, { zoneId: 1 });
  await installSceneProbe(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await waitForLanding(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page);
}

for (const size of SIZES) {
  for (const preset of ["DAY", "NIGHT"] as const) {
    test(`X1 ${size.name} ${preset}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openLanding(page, preset);
      const shoot = async (name: string) => {
        const path = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path });
        await testInfo.attach(name, { path, contentType: "image/png" });
      };
      await shoot(`landing-${size.name}-${preset.toLowerCase()}`);
      await page.getByRole("button", { name: E2E_START_CREATE_LABEL, exact: true }).click();
      await expect(page.locator("[data-flow-state]")).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
      await expect(page.getByTestId("customizer-panel")).toBeVisible();
      await waitForCameraRest(page);
      await shoot(`customizer-${size.name}-${preset.toLowerCase()}`);
    });
  }
}
