import { expect, test } from "@playwright/test";

test("home page responds 200 and renders", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
});

test("a WebGL context can be created", async ({ page }) => {
  await page.goto("/");
  const hasWebGL = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  });
  expect(hasWebGL).toBe(true);
});
