import { expect, test } from "@playwright/test";

const root = (page: import("@playwright/test").Page) => page.locator("[data-flow-state]");

test("strong hardware hints give HIGH", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
});

test("weak memory hint gives LOW", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
});

test("reduced motion tracks changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(root(page)).toHaveAttribute("data-reduced-motion", "false");
});
