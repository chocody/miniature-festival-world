import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  E2E_CANCEL_CREATE_LABEL,
  E2E_CENTRE_TOLERANCE_PX,
  E2E_FRAMING_TOLERANCE,
  E2E_START_CREATE_LABEL,
} from "./fixtures/landingFixtures";
import { E2E_DESIGN_GROUP_LABEL } from "./fixtures/krathongModels";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_STAGE_VIEWPORTS } from "./fixtures/stageFixtures";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { openCustomizer, waitForLanding } from "./helpers/activeEvent";
import { projectToClient, readCamera, type CameraReading } from "./helpers/cameraProbe";
import { expectClearOfRiver, hudButtons } from "./helpers/hud";
import { expectWorldAfterRelease } from "./helpers/release";
import {
  E2E_LAND_NAMES,
  E2E_MIN_TOUCH_TARGET_PX,
  E2E_PINNED_TIER_URL,
  E2E_WATER_NAME,
  installSceneProbe,
  locateStableTarget,
  sceneHasObject,
  waitForCameraRest,
} from "./helpers/sceneProbe";
import { SCENE_SELECTOR, forceTier } from "./helpers/stage";
import { completeWishStep } from "./helpers/wishStep";

/**
 * MFW-154 (backlog 18.1): the app lands in the shared world (village + river, the post-release framing, the newest zone); the
 * start button opens the customizer with a camera hand-over and the DRAFT close control flies back. LOW pinned so the FPS watcher
 * cannot step the tier down mid-test.
 */
test.use({ timezoneId: "Asia/Bangkok", viewport: { width: 390, height: 844 }, hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator(SCENE_SELECTOR);
const startButton = (page: Page) => page.getByRole("button", { name: E2E_START_CREATE_LABEL, exact: true });
const TOP_SLOT = '[data-overlay-slot="top"]';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Both zone endpoints from fixtures (`sizes[zone]` items per zone). */
async function routeZones(page: Page, zoneCount: number, sizes: Record<number, number>): Promise<void> {
  await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount } }));
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const zone = Number(new URL(route.request().url()).searchParams.get("zone"));
      return route.fulfill({ json: makeZoneBody(zone, sizes[zone] ?? 0) });
    },
  );
}

async function openLanding(page: Page, zones: { count: number; sizes: Record<number, number> } | null): Promise<string[]> {
  const errors = collectPageErrors(page);
  await forceTier(page, 2, 2);
  await installSceneProbe(page);
  if (zones !== null) await routeZones(page, zones.count, zones.sizes);
  await mockCreateCreation(page, { zoneId: zones?.count ?? 1 });
  await page.goto(E2E_PINNED_TIER_URL);
  await waitForLanding(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await expect(page.locator("canvas")).toHaveCount(1);
  return errors;
}

async function landingCamera(page: Page): Promise<CameraReading> {
  await waitForCameraRest(page);
  const camera = await readCamera(page);
  expect(camera, "scene probe camera").not.toBeNull();
  return camera!;
}

function expectSameCamera(got: CameraReading, want: CameraReading) {
  for (const k of ["x", "y", "z", "zoom"] as const) {
    expect(Math.abs(got[k] - want[k]), `camera ${k}: ${got[k]} vs ${want[k]}`).toBeLessThanOrEqual(E2E_FRAMING_TOLERANCE);
  }
}

async function expectOriginCentred(page: Page) {
  const at = await projectToClient(page, { x: 0, y: 0, z: 0 });
  const box = (await page.locator("canvas").boundingBox())!;
  expect(at).not.toBeNull();
  expect(Math.abs(at!.x - (box.x + box.width / 2))).toBeLessThanOrEqual(E2E_CENTRE_TOLERANCE_PX);
  expect(Math.abs(at!.y - (box.y + box.height / 2))).toBeLessThanOrEqual(E2E_CENTRE_TOLERANCE_PX);
}

const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test("L1 the landing is the shared world on the newest zone: no customizer, the HUD and the zone navigator", async ({ page }) => {
  const errors = await openLanding(page, { count: 3, sizes: { 1: 2, 2: 2, 3: 2 } });
  await expect(root(page)).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
  await expect(scene(page)).toHaveAttribute("data-zone-id", "3");
  await expect(scene(page)).toHaveAttribute("data-river-item-count", "2");
  await expect(scene(page)).toHaveAttribute("data-own-krathong-pose", "HIDDEN");
  await expect(page.getByTestId("customizer-panel")).toHaveCount(0);
  await expect(page.getByRole("group", { name: E2E_DESIGN_GROUP_LABEL })).toHaveCount(0);
  const hud = hudButtons(page);
  await expect(hud.toggle).toBeVisible();
  await expect(hud.rotate).toBeVisible();
  await expect(page.getByTestId("sky-launch-switch")).toBeVisible();
  const nav = page.getByTestId("zone-navigator");
  await expect(nav).toBeVisible();
  await expect(page.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /คุ้งน้ำถัดไป/ })).toBeVisible();
  await expect(startButton(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("L2 an empty world still renders the village and the river", async ({ page }) => {
  const errors = await openLanding(page, { count: 1, sizes: {} });
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => sceneHasObject(page, E2E_WATER_NAME)).toBe(true);
  for (const name of E2E_LAND_NAMES) expect(await sceneHasObject(page, name), name).toBe(true);
  await expect(scene(page)).toHaveAttribute("data-river-item-count", "0");
  expect(errors).toEqual([]);
});

test("L2 unrouted (the server's no-env backend): the landing renders", async ({ page }) => {
  const errors = await openLanding(page, null);
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("L3 the empty-ground tap works on the landing", async ({ page }) => {
  await openLanding(page, { count: 1, sizes: { 1: 2 } });
  await waitForCameraRest(page);
  const before = Number(await scene(page).getAttribute("data-gimmick-count"));
  const sky = await locateStableTarget(page, "sky");
  await page.touchscreen.tap(sky.x, sky.y);
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(before + 1));
  expect(["firework", "villager-hop"]).toContain(await scene(page).getAttribute("data-last-gimmick"));
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
});

test("L4 the button hands the camera over to the customizer; the close control flies back to the landing framing", async ({ page }) => {
  await openLanding(page, { count: 1, sizes: { 1: 2 } });
  const landing = await landingCamera(page);
  await startButton(page).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await expect(scene(page)).toHaveAttribute("data-own-krathong-pose", "ORIGIN");
  await expect(page.getByRole("group", { name: E2E_DESIGN_GROUP_LABEL }).getByRole("button")).toHaveCount(5);
  await waitForCameraRest(page);
  await expectOriginCentred(page);

  await page.getByRole("button", { name: E2E_CANCEL_CREATE_LABEL, exact: true }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.getByTestId("customizer-panel")).toHaveCount(0);
  await expect(startButton(page)).toBeVisible();
  expectSameCamera(await landingCamera(page), landing);
});

test("L5 reduced motion: the hand-over is an instant cut", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLanding(page, { count: 1, sizes: { 1: 2 } });
  await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
  await waitForCameraRest(page);
  await startButton(page).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await nextFrames(page);
  await expectOriginCentred(page);
});

test("L6 the landing framing equals the post-release framing", async ({ page }) => {
  await openLanding(page, { count: 1, sizes: { 1: 2 } });
  const landing = await landingCamera(page);
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  expectSameCamera(await landingCamera(page), landing);
});

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  // Touching edges are allowed.
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const vp of E2E_STAGE_VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`L7 [${vp.width}×${vp.height}] the start button is a 44 px target clear of the HUD and the river`, async ({ page }) => {
      await openLanding(page, { count: 3, sizes: { 1: 2, 2: 2, 3: 2 } });
      await waitForCameraRest(page);
      const start = startButton(page);
      const box = (await start.boundingBox())!;
      expect(Math.round(box.width)).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
      const hud = hudButtons(page);
      const others: Locator[] = [hud.findMy, hud.toggle, hud.rotate, page.getByTestId("sky-launch-switch"), page.locator(TOP_SLOT)];
      for (const other of others) {
        if ((await other.count()) === 0 || !(await other.first().isVisible())) continue;
        const o = (await other.first().boundingBox())!;
        expect(overlaps(box, o), `start button ${JSON.stringify(box)} overlaps ${JSON.stringify(o)}`).toBe(false);
      }
      await expectClearOfRiver(page, [start]);
    });
  });
}
