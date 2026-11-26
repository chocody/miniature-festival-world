import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { completeWishStep } from "./helpers/wishStep";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_SWIFTSHADER_3D_VIEWPORT, E2E_WATER_TAP_OFFSET_PX } from "./fixtures/stageFixtures";
import { sceneZoomScale } from "./helpers/stage";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * E2E_WATER_TAP_OFFSET_PX: world (−3, −0.24, −0.15) on the river centreline, projected by the default orthographic camera (position
 * CAMERA_FLIGHT_OFFSET looking at the origin) at zoom E2E_PROBED_CAMERA_ZOOM; scaled to the framed zoom (MFW-54). An orthographic
 * projection does not depend on the viewport width. It is about 133 px from the centre krathong at zoom 52, and MFW-27's
 * no-occlusion test keeps props off the lanes.
 */

async function openWorld(page: Page, memory: number, cores: number, startUrl = "/") {
  await mockCreateCreation(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
  await page.goto(startUrl);
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
  return { pageErrors, consoleErrors };
}

/** The release's touchdown ripple (MFW-23) is already counted when the world opens, so taps are counted from this baseline. */
async function gimmickBaseline(page: Page): Promise<number> {
  return Number(await scene(page).getAttribute("data-gimmick-count"));
}

async function tapWater(page: Page, times: number) {
  const box = (await scene(page).boundingBox())!;
  const scale = await sceneZoomScale(page);
  const x = box.x + box.width / 2 + E2E_WATER_TAP_OFFSET_PX.x * scale;
  const y = box.y + box.height / 2 + E2E_WATER_TAP_OFFSET_PX.y * scale;
  for (let i = 0; i < times; i++) await page.touchscreen.tap(x, y);
}

test("HIGH tier: water taps record ripples without errors", async ({ page }) => {
  const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL); // pinned: HIGH must not step down mid-test
  const base = await gimmickBaseline(page);
  await tapWater(page, 1);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
  await tapWater(page, 12);
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 13));
  await nextFrames(page);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test("LOW tier: water taps record ripples without errors", async ({ page }) => {
  const errors = await openWorld(page, 2, 2);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  const base = await gimmickBaseline(page);
  await tapWater(page, 6);
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 6));
  await nextFrames(page);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("HIGH tier: a water tap still records a ripple", async ({ page }) => {
    const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL); // pinned: see the HIGH test
    await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
    await tapWater(page, 1);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
    await nextFrames(page);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
