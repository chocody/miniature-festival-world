import { expect, test } from "@playwright/test";
import { makeChristmasBandBody, CHRISTMAS_E2E_DIRECTORY } from "./fixtures/christmasFixtures";
import { routeChristmasWorld, waitForChristmasEvent } from "./helpers/christmas";

test("the christmas server opens the christmas event", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await waitForChristmasEvent(page);
});

test("the 12-band directory fixture is served to the page", async ({ page }) => {
  const world = await routeChristmasWorld(page);
  await page.goto("/");
  const get = (path: string) =>
    page.evaluate(async (p) => (await fetch(p)).json(), path);
  expect(await get("/api/zones?event=christmas")).toEqual(CHRISTMAS_E2E_DIRECTORY);
  expect(await get("/api/creations?event=christmas&zone=12")).toEqual(makeChristmasBandBody(12));
  expect(world.requestedBands).toEqual([12]);
});
