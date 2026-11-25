import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneItem } from "./fixtures/zoneFixtures";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";
import {
  E2E_MIN_TOUCH_TARGET_PX,
  E2E_PINNED_TIER_URL,
  installSceneProbe,
  locateStableTarget,
  waitForCameraRest,
  type ScreenPoint,
} from "./helpers/sceneProbe";
import {
  E2E_WORLD_ROTATE_BUTTON_NAME,
  mouseDragHold,
  projectToClient,
  readCamera,
  readWorldViewTransform,
  touchDrag,
  worldPointUnder,
} from "./helpers/cameraProbe";

/**
 * MFW-57 (backlog 11.1): in WORLD_EXPLORE a one-finger / mouse drag moves the camera and the world under the pointer follows
 * it; taps still interact after the pan; wheel zooms; the rotate button turns the view. HIGH tier at the SwiftShader viewport,
 * on the pinned-tier URL (the CI runner is below the FALLBACK_2D FPS threshold).
 *
 * The drag goes straight down from a water point: at the yaw-0 release view (camera on the pier side, +z) this moves the focus
 * toward the river centre, away from the pier-side bound, so no edge resistance applies to the follow check.
 */
const E2E_DRAG_PX = 40;
const E2E_DRAG_STEPS = 8;
const E2E_FOLLOW_TOLERANCE_PX = 1.5;
const DRAG: ScreenPoint = { x: 0, y: E2E_DRAG_PX };
const CAMERA_MOVED_EPSILON = 1e-3;
const CAMERA_Y_EPSILON = 1e-6;
const SPAWN_PROGRESS = [0.35, 0.5, 0.65];

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function routeZone(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) =>
      route.fulfill({
        json: {
          eventId: E2E_EVENT_ID,
          zoneId: 1,
          limit: 80,
          items: SPAWN_PROGRESS.map((progress, i) => {
            const item = makeZoneItem(1, i + 1) as { coord: Record<string, unknown> };
            return { ...item, displayName: null, coord: { ...item.coord, spawnProgress: progress }, createdAt: new Date().toISOString() };
          }),
        },
      }),
  );
  await mockCreateCreation(page);
}

async function setTier(page: Page, memory: number, cores: number) {
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
}

async function walkToWorld(page: Page) {
  await page.goto(E2E_PINNED_TIER_URL);
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function openWorld(page: Page) {
  const errors = collectErrors(page);
  await installSceneProbe(page);
  await setTier(page, 8, 8);
  await routeZone(page);
  await walkToWorld(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page);
  return errors;
}

/** MFW-57 × MFW-55: the rotate button is visible and clear of every overlay slot (top card, bottom sheet, hint). */
async function expectRotateButtonClear(page: Page) {
  const button = page.getByRole("button", { name: E2E_WORLD_ROTATE_BUTTON_NAME });
  await expect(button).toBeVisible();
  const b = (await button.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX - 0.5);
  expect(b.height).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX - 0.5);
  const vp = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  for (const slot of await page.locator("[data-overlay-slot]").all()) {
    const o = await slot.boundingBox();
    if (!o || o.width === 0 || o.height === 0) continue;
    const overlaps = b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height;
    expect(overlaps, `rotate button overlaps the ${await slot.getAttribute("data-overlay-slot")} slot`).toBe(false);
  }
}

const gimmickCount = async (page: Page) => Number(await scene(page).getAttribute("data-gimmick-count"));

/** Steps 1–5: drag pans the camera (world follows the pointer), interacts with nothing, and a tap afterwards still ripples. */
async function dragPansAndTapWorks(
  page: Page,
  hold: (from: ScreenPoint) => Promise<{ release: () => Promise<void> }>,
  tap: (p: ScreenPoint) => Promise<void>,
): Promise<number> {
  const before = (await readCamera(page))!;
  expect(before).not.toBeNull();
  const count = await gimmickCount(page);
  const selected = await scene(page).getAttribute("data-selected-target");

  const start = await locateStableTarget(page, "water");
  const anchor = (await worldPointUnder(page, start))!;
  expect(anchor).not.toBeNull();

  const { release } = await hold(start);
  await nextFrames(page);
  const followed = (await projectToClient(page, anchor))!;
  expect(Math.abs(followed.x - (start.x + DRAG.x))).toBeLessThanOrEqual(E2E_FOLLOW_TOLERANCE_PX);
  expect(Math.abs(followed.y - (start.y + DRAG.y))).toBeLessThanOrEqual(E2E_FOLLOW_TOLERANCE_PX);
  await release();

  await waitForCameraRest(page);
  const after = (await readCamera(page))!;
  expect(Math.max(Math.abs(after.x - before.x), Math.abs(after.z - before.z))).toBeGreaterThan(CAMERA_MOVED_EPSILON);
  const world = (await readWorldViewTransform(page))!;
  expect(world).not.toBeNull();
  expect(world.position).toEqual([0, 0, 0]);
  expect(world.rotation).toEqual([0, 0, 0]);
  expect(await gimmickCount(page)).toBe(count);
  expect(await scene(page).getAttribute("data-selected-target")).toBe(selected);

  // A tap after the pan still interacts.
  const water = await locateStableTarget(page, "water");
  await tap(water);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(count + 1));
  return count;
}

test.describe("mouse", () => {
  test.use({ viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

  test("mouse: drag pans the camera and taps still work", async ({ page }) => {
    const errors = await openWorld(page);
    const base = await dragPansAndTapWorks(
      page,
      async (from) => {
        await mouseDragHold(page, from, DRAG, E2E_DRAG_STEPS);
        return { release: () => page.mouse.up() };
      },
      (p) => page.mouse.click(p.x, p.y),
    );

    // Wheel zooms the camera; the framed base zoom (MFW-54) is unchanged.
    await waitForCameraRest(page);
    const baseZoom = await scene(page).getAttribute("data-camera-zoom");
    const zoomBefore = (await readCamera(page))!.zoom;
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await readCamera(page))!.zoom).toBeGreaterThan(zoomBefore);
    expect(await scene(page).getAttribute("data-camera-zoom")).toBe(baseZoom);

    // Rotate button turns the view about the focus.
    const button = page.getByRole("button", { name: E2E_WORLD_ROTATE_BUTTON_NAME });
    await expectRotateButtonClear(page);
    const beforeRotate = (await readCamera(page))!;
    await button.click();
    await expect
      .poll(async () => {
        const c = (await readCamera(page))!;
        return Math.max(Math.abs(c.x - beforeRotate.x), Math.abs(c.z - beforeRotate.z));
      })
      .toBeGreaterThan(CAMERA_MOVED_EPSILON);
    await waitForCameraRest(page);
    const afterRotate = (await readCamera(page))!;
    expect(Math.abs(afterRotate.y - beforeRotate.y)).toBeLessThan(CAMERA_Y_EPSILON);

    // A water tap still ripples after the rotation.
    const water = await locateStableTarget(page, "water");
    await page.mouse.click(water.x, water.y);
    await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 2));

    await nextFrames(page);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

  test("touch: drag pans the camera and taps still work", async ({ page }) => {
    const errors = await openWorld(page);
    await dragPansAndTapWorks(
      page,
      async (from) => {
        const finger = await touchDrag(page, from, DRAG, E2E_DRAG_STEPS);
        return { release: finger.end };
      },
      (p) => page.touchscreen.tap(p.x, p.y),
    );
    await nextFrames(page);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test.describe("rotate button layout", () => {
  for (const viewport of [E2E_SWIFTSHADER_3D_VIEWPORT, { width: 390, height: 844 }]) {
    test(`${viewport.width}×${viewport.height}: the rotate button is clear of the top card and the bottom sheet`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await openWorld(page);
      await expectRotateButtonClear(page);
      await page.getByRole("button", { name: "ค้นหาของฉัน" }).click(); // the top card grows with My Creations
      await expect(page.getByTestId("my-creations")).toHaveAttribute("data-open", "true");
      await expectRotateButtonClear(page);
      expect(errors.pageErrors).toEqual([]);
      expect(errors.consoleErrors).toEqual([]);
    });
  }
});
