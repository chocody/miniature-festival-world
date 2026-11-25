import { expect, test, type Page } from "@playwright/test";
import { waitForActiveEvent } from "./helpers/activeEvent";

/** Duplicated literals (do not import src/ into Playwright): LIGHT_PRESET_STORAGE_KEY / LIGHT_PRESET_SWITCH_COPY in src/config/look.config.ts. */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1";
const SWITCH_AUTO = "ตามเวลาจริง";
const SWITCH_NIGHT = "กลางคืน";

test.use({ timezoneId: "Asia/Bangkok" });

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
  await page.goto("/");
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");

  await page.clock.setFixedTime(new Date("2026-11-25T20:00:00+07:00"));
  await page.goto("/");
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test("the switch overrides the time and the choice stays on the device (MFW-47 AC3)", async ({ page }) => {
  const errors = await openScene(page);
  await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+07:00"));
  await page.goto("/");
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");

  await page.getByRole("radio", { name: SWITCH_NIGHT }).click();
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");
  expect(await page.evaluate((key) => localStorage.getItem(key), LIGHT_PRESET_STORAGE_KEY)).toBe("NIGHT");

  await page.reload();
  await enterLoyKrathong(page);
  await expect(scene(page)).toHaveAttribute("data-light-preset", "NIGHT");
  await expect(page.getByRole("radio", { name: SWITCH_NIGHT })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("radio", { name: SWITCH_AUTO }).click();
  await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");
  expect(await page.evaluate((key) => localStorage.getItem(key), LIGHT_PRESET_STORAGE_KEY)).toBeNull();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
