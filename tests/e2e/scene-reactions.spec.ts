import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_MAX_SHADER_PROGRAMS } from "./fixtures/perfAudit";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";
import {
  E2E_CHIMNEY_SMOKE_NAME,
  E2E_DRAG_START_DISTANCE_PX,
  E2E_FIREWORK_NAME,
  E2E_PINNED_TIER_URL,
  E2E_WINDOW_GLOW_NAME,
  installSceneProbe,
  listRingAndHaloMeshes,
  locateStableTarget,
  readProgramCount,
  sceneObjectVisible,
  waitForCameraRest,
} from "./helpers/sceneProbe";

/**
 * MFW-60 (backlog 11.4): scene reactions on the production build (SwiftShader). A sky tap (bare land) launches a firework, a house
 * tap lights its windows, a drag fires nothing, no reaction adds a shader program and nothing draws a ring or a halo. Every target
 * is located through the scene probe (never a fixed screen point) and every check polls a DOM attribute.
 * MFW-72 (backlog 11.6): the house tap also puffs chimney smoke (no new program, no ring or halo); under reduced motion it does not.
 */

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function openWorld(page: Page, memory: number, cores: number, startUrl: string) {
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
  await installSceneProbe(page);
  await page.goto(startUrl);
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page);
  return { pageErrors, consoleErrors };
}

const count = async (page: Page) => Number(await scene(page).getAttribute("data-gimmick-count"));

/** Drag distance: well past DRAG_START_DISTANCE_PX, and far enough to pan the village into the 360 × 640 frame. */
const PAN_DRAG_PX = 20 * E2E_DRAG_START_DISTANCE_PX;
const PAN_DRAG_STEPS = 8;

/** A mouse drag that starts on bare land and pans the world down (the camera travels; MFW-57), then waits for the camera. */
async function dragFromLand(page: Page) {
  const from = await locateStableTarget(page, "sky");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + PAN_DRAG_PX, { steps: PAN_DRAG_STEPS });
  await page.mouse.up();
  await waitForCameraRest(page);
}

test("S1 HIGH: a sky tap launches a firework, a house tap lights its windows, a drag fires nothing", async ({ page }) => {
  const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await nextFrames(page);
  const programsBefore = await readProgramCount(page);
  const base = await count(page);

  const sky = await locateStableTarget(page, "sky");
  await page.touchscreen.tap(sky.x, sky.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "firework");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
  await expect.poll(() => sceneObjectVisible(page, E2E_FIREWORK_NAME)).toBe(true); // drawn now (the mesh exists from mount)
  await expect(scene(page)).not.toHaveAttribute("data-selected-target", "lamp"); // a prop tap selects nothing

  // A drag that starts on bare land pans the camera and fires no reaction (MFW-57 / MFW-59 tap-drag separation). It pans the
  // village (which sits under the top overlay at the pier framing on 360 × 640) into view.
  await dragFromLand(page);
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));

  const house = await locateStableTarget(page, "house");
  await page.touchscreen.tap(house.x, house.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 2));
  await expect.poll(() => sceneObjectVisible(page, E2E_WINDOW_GLOW_NAME)).toBe(true);
  // MFW-72: the smoke puff is drawn too; the program and ring / halo checks below cover it.
  await expect.poll(() => sceneObjectVisible(page, E2E_CHIMNEY_SMOKE_NAME)).toBe(true);

  await waitForCameraRest(page);
  const water = await locateStableTarget(page, "water");
  await page.touchscreen.tap(water.x, water.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 3)); // the drag added nothing

  await nextFrames(page);
  const programsAfter = await readProgramCount(page);
  expect(programsAfter).not.toBeNull();
  // The reactions reuse the ripple / lamp-glow program. (HIGH also compiles the shadow-map programs, so the absolute LOW-tier budget
  // E2E_MAX_SHADER_PROGRAMS is checked in S3.)
  expect(programsAfter).toBe(programsBefore);
  await expect.poll(() => listRingAndHaloMeshes(page)).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("S2 HIGH: a sky tap and a house tap still react (static variants)", async ({ page }) => {
    const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL);
    await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
    const base = await count(page);
    const sky = await locateStableTarget(page, "sky");
    await page.touchscreen.tap(sky.x, sky.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "firework");
    await dragFromLand(page);
    const house = await locateStableTarget(page, "house");
    await page.touchscreen.tap(house.x, house.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
    await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 2));
    // MFW-72: the instant state is the window light-up; no smoke particles under reduced motion.
    await expect.poll(() => sceneObjectVisible(page, E2E_WINDOW_GLOW_NAME)).toBe(true);
    await nextFrames(page);
    expect(await sceneObjectVisible(page, E2E_CHIMNEY_SMOKE_NAME)).toBe(false);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test.describe("LOW", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("S3 LOW: a sky tap launches the cheap firework", async ({ page }) => {
    const errors = await openWorld(page, 2, 2, "/");
    await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
    await nextFrames(page);
    const programsBefore = await readProgramCount(page);
    const base = await count(page);
    const sky = await locateStableTarget(page, "sky");
    await page.touchscreen.tap(sky.x, sky.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "firework");
    await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
    await nextFrames(page);
    const programsAfter = await readProgramCount(page);
    expect(programsAfter).toBe(programsBefore); // the firework adds no shader program
    expect(programsAfter!).toBeLessThanOrEqual(E2E_MAX_SHADER_PROGRAMS);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
