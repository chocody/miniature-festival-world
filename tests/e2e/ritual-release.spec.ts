import { expect, test, type Page } from "@playwright/test";
import { E2E_OWNER_TOKEN_STORAGE_KEY, mockCreateCreation, type MockCreateOptions } from "./fixtures/ritualRoutes";
import { completeWishStep } from "./helpers/wishStep";
import { openCustomizer } from "./helpers/activeEvent";
import { sceneZoomScale } from "./helpers/stage";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const CHIP = '[data-input-target="krathong"]';
const DROP_ON_WATER = "วางกระทงบนผิวน้ำเพื่อปล่อย";
const NETWORK_ERROR = "เชื่อมต่อไม่ได้ ลองกดปล่อยกระทงอีกครั้ง";
const UNAVAILABLE_ERROR = "ยังบันทึกกระทงไม่ได้ในขณะนี้ ลองใหม่อีกครั้งภายหลัง";
const root = (page: Page) => page.locator("[data-flow-state]");
const releaseButton = (page: Page) => page.getByRole("button", { name: "ปล่อยกระทง" });
const SIX_KEYS = ["appearance", "coord", "eventId", "ownerToken", "wishText", "wishVisibility"];
const COORD_KEYS = ["laneId", "lateralOffset", "mode", "spawnProgress", "speedFactor"];
/** Drag distances (px) from the chip at the viewport centre; lead-probed on the ritual view: up = water, down = bank. */
const DRAG_UP_PX = 40;
const DRAG_DOWN_PX = 60;

async function forceHighTier(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
}

async function toRitual(page: Page, startUrl = "/") {
  await page.goto(startUrl);
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
}

/** `pinned`: the 3D-only tests keep the forced HIGH tier (no runtime step-down on slow SwiftShader runners). */
async function setup(page: Page, options?: MockCreateOptions, pinned = false) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = await mockCreateCreation(page, options);
  await forceHighTier(page);
  await toRitual(page, pinned ? E2E_PINNED_TIER_URL : "/");
  return { errors, requests: mock.requests };
}

async function dragChip(page: Page, dyPx: number) {
  const box = (await page.locator(CHIP).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dyPx / 2, { steps: 4 });
  await page.mouse.move(x, y + dyPx, { steps: 4 });
  await page.mouse.up();
}

test("3D: releases from the pier", async ({ page }) => {
  const { errors, requests } = await setup(page, undefined, true);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-own-krathong-pose", "PIER");
  await releaseButton(page).click();
  await expectWorldAfterRelease(page);
  expect(requests).toHaveLength(1);
  const { url, body } = requests[0];
  expect(new URL(url).pathname).toBe("/api/creations");
  expect(new URL(url).search).toBe("");
  expect(Object.keys(body).sort()).toEqual(SIX_KEYS);
  const token = await page.evaluate((key) => window.localStorage.getItem(key), E2E_OWNER_TOKEN_STORAGE_KEY);
  expect(body.ownerToken).toBe(token);
  expect(url).not.toContain(String(token));
  const coord = body.coord as Record<string, unknown>;
  expect(Object.keys(coord).sort()).toEqual(COORD_KEYS);
  expect(coord).toMatchObject({ mode: "SPLINE_PATH", laneId: 1, speedFactor: 0.008 });
  expect(body.wishVisibility).toBe("private");
  await expect(root(page)).toHaveAttribute("data-own-krathong", "released");
  await expect(root(page)).toHaveAttribute("data-ritual-bumped", "false");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-own-krathong-pose", "RIVER");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("3D: drag onto the water", async ({ page }) => {
  const { errors, requests } = await setup(page, undefined, true);
  await expect(page.locator("canvas")).toHaveCount(1);
  // The drag lengths were probed at zoom E2E_PROBED_CAMERA_ZOOM; scaled to the framed zoom (MFW-54) they reach the same world points.
  const scale = await sceneZoomScale(page);
  await dragChip(page, DRAG_DOWN_PX * scale);
  await expect(page.getByTestId("ritual-status")).toHaveText(DROP_ON_WATER);
  expect(requests).toHaveLength(0);
  await dragChip(page, -DRAG_UP_PX * scale);
  await expectWorldAfterRelease(page);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("server moved the spot", async ({ page }) => {
  await setup(page, { moveLateralBy: -0.2 });
  await releaseButton(page).click();
  await expectWorldAfterRelease(page);
  await expect(root(page)).toHaveAttribute("data-ritual-bumped", "true");
});

test("503 then retry", async ({ page }) => {
  const { requests } = await setup(page, { status: 503, errorBody: { error: "unavailable" } });
  await releaseButton(page).click();
  await expect(page.getByTestId("ritual-status")).toHaveText(UNAVAILABLE_ERROR);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(releaseButton(page)).toBeEnabled();
  await page.unroute((url) => url.pathname === "/api/creations");
  await mockCreateCreation(page);
  await releaseButton(page).click();
  await expectWorldAfterRelease(page);
  expect(requests).toHaveLength(1);
});

test("network failure", async ({ page }) => {
  await setup(page, { abort: true });
  await releaseButton(page).click();
  await expect(page.getByTestId("ritual-status")).toHaveText(NETWORK_ERROR);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
});

test("moderation-blocked returns to the wish", async ({ page }) => {
  await setup(page, { status: 422, errorBody: { error: "moderation_blocked", reasons: ["phone"] } });
  await releaseButton(page).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expect(page.getByTestId("wish-moderation-warning")).toBeVisible();
});

test("reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
  await releaseButton(page).click();
  await expectWorldAfterRelease(page);
});

test("360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await setup(page);
  await expect(releaseButton(page)).toBeInViewport();
  await expect(releaseButton(page)).toBeEnabled();
});
