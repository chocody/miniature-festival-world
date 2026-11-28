import { expect, test } from "@playwright/test";
import { makeChristmasBandBody, CHRISTMAS_E2E_DIRECTORY } from "./fixtures/christmasFixtures";
import { E2E_CHRISTMAS_START_CREATE_LABEL } from "./fixtures/landingFixtures";
import { routeChristmasWorld, waitForChristmasEvent } from "./helpers/christmas";

test("the christmas server opens the christmas event", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await waitForChristmasEvent(page);
});

test("CS1 the christmas landing is the world; its own start button opens the customizer (MFW-154)", async ({ page }) => {
  await page.goto("/");
  await waitForChristmasEvent(page);
  const root = page.locator("[data-flow-state]");
  await expect(root).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  const start = page.getByRole("button", { name: E2E_CHRISTMAS_START_CREATE_LABEL, exact: true });
  await expect(start).toBeVisible();
  await start.click();
  await expect(root).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
});

test("the 12-band directory fixture is served to the page", async ({ page }) => {
  const world = await routeChristmasWorld(page);
  await page.goto("/");
  // MFW-154: the landing loads the world itself (the newest band first, as after a release).
  await expect.poll(() => world.requestedBands.length).toBeGreaterThan(0);
  const get = (path: string) =>
    page.evaluate(async (p) => (await fetch(p)).json(), path);
  expect(await get("/api/zones?event=christmas")).toEqual(CHRISTMAS_E2E_DIRECTORY);
  expect(await get("/api/creations?event=christmas&zone=12")).toEqual(makeChristmasBandBody(12));
  expect(world.requestedBands[0]).toBe(12);
  for (const band of world.requestedBands) {
    expect(Number.isInteger(band)).toBe(true);
    expect(band).toBeGreaterThanOrEqual(1);
    expect(band).toBeLessThanOrEqual(12);
  }
});
