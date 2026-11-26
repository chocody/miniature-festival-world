import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import {
  E2E_LIGHT_PRESET_STORAGE_KEY,
  E2E_LOW_MAX_RENDER_PIXELS,
  E2E_PINCH_ZOOM_MIN,
  E2E_SCENE_BACKGROUNDS,
  E2E_STAGE_VIEWPORTS,
  coverageSamplePoints,
  e2eFramedZoom,
  isBackgroundPixel,
} from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { STAGE_ONLY_SECTION_CSS, readStagePixels } from "./helpers/backgroundProbe";
import { E2E_WORLD_ROTATE_BUTTON_NAME, mouseDragHold, readCamera } from "./helpers/cameraProbe";
import { E2E_PINNED_TIER_URL, installSceneProbe, locateStableTarget, waitForCameraRest } from "./helpers/sceneProbe";
import { SCENE_SELECTOR, forceTier } from "./helpers/stage";
import { completeWishStep } from "./helpers/wishStep";

/**
 * MFW-68 (backlog 13.4) AC2 / AC4 / AC5: no background (clear colour) pixel at the four corners and the centre of the stage in
 * every scene step and after a zoom-out, a rotation and a pan; the canvas stays within the LOW pixel cap. LOW is forced: it has
 * no FPS step-down (like full-screen-stage.spec.ts), and the pinned-tier URL keeps it. DAY is pinned: the NIGHT clear colour is
 * close to the moonlit ground. Mouse / click / wheel only (no hasTouch).
 */
const WHEEL_ZOOM_OUT_PX = 2000;
const PAN_FRACTION = { x: 0.3, y: 0.15 } as const;
const PAN_STEPS = 8;

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator(SCENE_SELECTOR);

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function openStage(page: Page) {
  const errors = collectErrors(page);
  await forceTier(page, 2, 2);
  await page.addInitScript((key) => localStorage.setItem(key, "DAY"), E2E_LIGHT_PRESET_STORAGE_KEY);
  await installSceneProbe(page);
  await mockCreateCreation(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await waitForActiveEvent(page);
  return errors;
}

async function expectNoBackground(page: Page, step: string) {
  const preset = (await scene(page).getAttribute("data-light-preset")) as keyof typeof E2E_SCENE_BACKGROUNDS;
  expect(preset === "DAY" || preset === "NIGHT", `light preset ${preset}`).toBe(true);
  const vp = page.viewportSize()!;
  for (const { name, rgb } of await readStagePixels(page, coverageSamplePoints(vp.width, vp.height))) {
    expect(isBackgroundPixel(rgb, E2E_SCENE_BACKGROUNDS[preset]), `${step} ${name} rgb(${rgb})`).toBe(false);
  }
}

async function expectCanvasWithinLowPixelBudget(page: Page) {
  const { w, h } = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(w * h).toBeLessThanOrEqual(E2E_LOW_MAX_RENDER_PIXELS + w + h);
}

for (const vp of E2E_STAGE_VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no background pixel at the corners and the centre in every scene step and after zoom-out, rotate and pan", async ({ page }) => {
      test.slow();
      const errors = await openStage(page);
      await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
      await expect(page.locator("canvas")).toHaveCount(1);
      await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");
      const framed = e2eFramedZoom(vp.width, vp.height);
      await expect.poll(async () => Number(await scene(page).getAttribute("data-camera-zoom"))).toBeCloseTo(framed, 6);

      await waitForCameraRest(page);
      await expectNoBackground(page, "customize");

      await page.getByRole("button", { name: "ถัดไป" }).click();
      await completeWishStep(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
      await waitForCameraRest(page);
      await expectNoBackground(page, "ritual");

      await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
      await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
      await waitForCameraRest(page);
      await expectNoBackground(page, "world");
      await expectCanvasWithinLowPixelBudget(page);

      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.wheel(0, WHEEL_ZOOM_OUT_PX);
      await expect.poll(async () => (await readCamera(page))?.zoom ?? 0).toBeCloseTo(framed * E2E_PINCH_ZOOM_MIN, 6);
      await waitForCameraRest(page);
      await expectNoBackground(page, "world zoomed out");

      await page.getByRole("button", { name: E2E_WORLD_ROTATE_BUTTON_NAME }).click();
      await waitForCameraRest(page);
      await expectNoBackground(page, "world rotated");

      const from = await locateStableTarget(page, "water");
      await mouseDragHold(
        page,
        from,
        { x: -Math.round(vp.width * PAN_FRACTION.x), y: -Math.round(vp.height * PAN_FRACTION.y) },
        PAN_STEPS,
      );
      await page.mouse.up();
      await waitForCameraRest(page);
      await expectNoBackground(page, "world panned");

      expect(errors.pageErrors).toEqual([]);
      expect(errors.consoleErrors).toEqual([]);
    });
  });
}

test.describe("probe control", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("control: the probe sees the stage background where the canvas is not drawn", async ({ page }) => {
    await openStage(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(scene(page)).toHaveAttribute("data-light-preset", "DAY");
    for (const { name, rgb } of await readStagePixels(page, coverageSamplePoints(390, 844), STAGE_ONLY_SECTION_CSS)) {
      expect(isBackgroundPixel(rgb, E2E_SCENE_BACKGROUNDS.DAY), `${name} rgb(${rgb})`).toBe(true);
    }
  });
});
