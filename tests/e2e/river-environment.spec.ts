import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const TIERS = [
  { tier: "HIGH", deviceMemory: 8, hardwareConcurrency: 8 },
  { tier: "LOW", deviceMemory: 2, hardwareConcurrency: 2 },
] as const;

for (const { tier, deviceMemory, hardwareConcurrency } of TIERS) {
  test(`${tier} tier: the river environment renders in every canvas mode without errors`, async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.addInitScript(
      ({ memory, cores }) => {
        Object.defineProperty(navigator, "deviceMemory", { get: () => memory, configurable: true });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => cores, configurable: true });
      },
      { memory: deviceMemory, cores: hardwareConcurrency },
    );
    await page.goto("/");
    await expect(root(page)).toHaveAttribute("data-quality-tier", tier);

    await page.getByRole("button", { name: /Loy Krathong/ }).click();
    await expect(page.locator("canvas")).toHaveCount(1);

    await page.getByRole("button", { name: "ถัดไป" }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
    await page.getByRole("button", { name: "ถัดไป" }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
    await expect(page.locator("canvas")).toHaveCount(1);

    await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
    await expect(page.locator("canvas")).toHaveCount(1);
    await nextFrames(page);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
