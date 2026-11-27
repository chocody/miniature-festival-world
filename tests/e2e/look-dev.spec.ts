import { expect, test, type Page } from "@playwright/test";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL, installSceneProbe, listRingAndHaloMeshes } from "./helpers/sceneProbe";

/** Duplicated literal (do not import src/ into Playwright): LIGHT_PRESET_STORAGE_KEY in src/config/look.config.ts. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1";

// HIGH is forced below: MFW-54's SwiftShader viewport and the pinned tier keep the 3D canvas on slow runners.
test.use({ timezoneId: "Asia/Bangkok", viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');

async function openScene(page: Page): Promise<{ pageErrors: string[]; consoleErrors: string[] }> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await installSceneProbe(page); // MFW-67: ring / halo check
  return { pageErrors, consoleErrors };
}

/** The app opens straight into the active event (MFW-53): wait for hydration, then for the 3D canvas. */
async function enterLoyKrathong(page: Page): Promise<void> {
  await waitForActiveEvent(page);
  await expect(page.locator("canvas")).toHaveCount(1);
}

test("AUTO follows the device's local time: DAY at 10:00, NIGHT at 20:00 (MFW-47 AC3)", async ({ page }) => {
  const errors = await openScene(page);
  await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+07:00"));
  await page.goto(E2E_PINNED_TIER_URL);
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");

  await page.clock.setFixedTime(new Date("2026-11-25T20:00:00+07:00"));
  await page.goto(E2E_PINNED_TIER_URL);
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test("the toggle overrides the time and the choice stays on the device (MFW-47 AC3, MFW-74)", async ({ page }) => {
  const errors = await openScene(page);
  await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+07:00"));
  await page.goto(E2E_PINNED_TIER_URL);
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");

  // The toggle floats over the full-screen stage in its own overlay corner (MFW-54 stage), not under the canvas.
  const toggle = page.getByTestId("day-night-toggle");
  await expect(toggle).toBeVisible();
  await expect(page.locator('[data-overlay-slot="corner"]').getByTestId("day-night-toggle")).toHaveCount(1);
  await toggle.click(); // 10:00: the other preset is NIGHT, which the clock does not show
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");
  // MFW-67: no ring and no additive halo (no lamp light pools, no highlight ring) at NIGHT.
  await expect.poll(() => listRingAndHaloMeshes(page)).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");

  await page.reload();
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");
  await expect(page.getByTestId("day-night-toggle")).toHaveAttribute("data-light-preset-choice", "NIGHT");

  await page.getByTestId("day-night-toggle").click(); // back to the clock's preset: the choice is dropped (AUTO)
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");
  expect(await page.evaluate((key) => localStorage.getItem(key), LIGHT_PRESET_STORAGE_KEY)).toBeNull();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
