import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneItem } from "./fixtures/zoneFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";
import { expectTapHintUnoccluded } from "./helpers/stage";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import {
  E2E_INSPECT_DIALOG_TITLE,
  E2E_MIN_TOUCH_TARGET_PX,
  E2E_PINNED_TIER_URL,
  E2E_TAP_HINT_SEEN_VALUE,
  E2E_TAP_HINT_STORAGE_KEY,
  installSceneProbe,
  listRingAndHaloMeshes,
  locateStableTarget,
  waitForCameraRest,
  type ScreenPoint,
} from "./helpers/sceneProbe";

/** MFW-59: taps on water, a lamp and a river krathong, with mouse and touch, on every 3D tier (production build, SwiftShader). */

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const hint = (page: Page) => page.getByTestId("scene-tap-hint");
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * MFW-54: the scene fills the viewport. LOW runs at 390×844 (a backlog 10.2 AC viewport, framed at zoom ≥ SCENE_CAMERA_ZOOM): it
 * is the full 44 px disc proof of MFW-59 AC3. HIGH / MEDIUM run at E2E_SWIFTSHADER_3D_VIEWPORT (360×640): SwiftShader cannot keep
 * them above the FPS fallback on a bigger full-screen canvas under load. Since MFW-68 360×640 is framed at zoom ≈ 66.7, so the
 * proxy discs are ≥ 44 px there too, and the full-ring assertion is the MFW-68 AC3 proof at 360 px wide.
 */
const TIERS = [
  { tier: "HIGH", memory: 8, cores: 8, viewport: E2E_SWIFTSHADER_3D_VIEWPORT },
  { tier: "MEDIUM", memory: 4, cores: 6, viewport: E2E_SWIFTSHADER_3D_VIEWPORT },
  { tier: "LOW", memory: 2, cores: 2, viewport: { width: 390, height: 844 } },
] as const;
const SPAWN_PROGRESS = [0.35, 0.5, 0.65];
const TOUCH_VIEWPORT = { width: 390, height: 844 };

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
  await mockCreateCreation(page); // after the zone routes: handles POST, GET falls back to them
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
  await page.goto(E2E_PINNED_TIER_URL); // per-tier taps must not race the runner's FPS fallback (SwiftShader on CI)
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

type Pointer = "mouse" | "touch";
const tap = (page: Page, pointer: Pointer, p: ScreenPoint) =>
  pointer === "touch" ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);

function defineTierTests(pointer: Pointer) {
  for (const { tier, memory, cores, viewport } of TIERS) {
    test(`${tier}: water, lamp and krathong react`, async ({ page }) => {
      await page.setViewportSize(viewport); // MFW-54: see TIERS
      const errors = collectErrors(page);
      await installSceneProbe(page);
      await setTier(page, memory, cores);
      await routeZone(page);
      await walkToWorld(page);
      await expect(root(page)).toHaveAttribute("data-quality-tier", tier);
      await expect(page.locator("canvas")).toHaveCount(1);
      await waitForCameraRest(page);

      await expect(hint(page)).toBeVisible();
      await expectTapHintUnoccluded(page); // MFW-54: above the bottom sheet
      const base = Number(await scene(page).getAttribute("data-gimmick-count"));

      // Water
      const water = await locateStableTarget(page, "water");
      await tap(page, pointer, water);
      await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
      await expect(hint(page)).toHaveCount(0);

      // Lamp
      await waitForCameraRest(page);
      const lamp = await locateStableTarget(page, "lamp");
      expect(lamp.ringHits).toBe(lamp.ringSamples); // AC3: the whole MIN_TOUCH_TARGET_PX disc hits the lamp proxy
      await tap(page, pointer, lamp);
      await expect(scene(page)).toHaveAttribute("data-last-gimmick", "lamp-glow");
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 2));
      await expect(scene(page)).toHaveAttribute("data-selected-target", "lamp");
      // MFW-67: the lamp lights up without a highlight ring or any other halo.
      await expect.poll(() => listRingAndHaloMeshes(page)).toEqual([]);

      // River krathong
      await waitForCameraRest(page);
      const krathong = await locateStableTarget(page, "krathong");
      expect(krathong.ringHits).toBe(krathong.ringSamples);
      await tap(page, pointer, krathong);
      await expect(page.getByRole("dialog", { name: E2E_INSPECT_DIALOG_TITLE })).toBeVisible();
      await expect(scene(page)).toHaveAttribute("data-last-gimmick", "inspect");
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 3));

      await nextFrames(page);
      expect(errors.pageErrors).toEqual([]);
      expect(errors.consoleErrors).toEqual([]);
    });
  }
}

test.describe("mouse", () => {
  defineTierTests("mouse");
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: TOUCH_VIEWPORT });
  defineTierTests("touch");
});

test.describe("FALLBACK_2D", () => {
  test("a mouse click on a krathong opens the popup", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await routeZone(page);
    await walkToWorld(page);
    await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
    await expectTapHintUnoccluded(page);
    const target = page.locator('[data-input-target="krathong"]').first();
    // MFW-54: centred, so the click never lands on an overlay of the full-screen stage.
    await target.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
    const box = (await target.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX - 0.5);
    expect(box.height).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX - 0.5);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("dialog", { name: E2E_INSPECT_DIALOG_TITLE })).toBeVisible();
    await expect(hint(page)).toHaveCount(0);
  });
});

test.describe("hint", () => {
  // MFW-54: these force HIGH; see TIERS for the viewport.
  test.use({ hasTouch: true, isMobile: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("static hint, gone after the first tap, remembered", async ({ page }) => {
      await installSceneProbe(page);
      await setTier(page, 8, 8);
      await routeZone(page);
      await walkToWorld(page);
      await waitForCameraRest(page);
      await expect(hint(page)).toHaveAttribute("data-motion", "static");
      const water = await locateStableTarget(page, "water");
      await page.touchscreen.tap(water.x, water.y);
      await expect(hint(page)).toHaveCount(0);
      expect(
        await page.evaluate((key) => window.localStorage.getItem(key), E2E_TAP_HINT_STORAGE_KEY),
      ).toBe(E2E_TAP_HINT_SEEN_VALUE);
    });
  });

  test("a returning visitor sees no hint", async ({ page }) => {
    await installSceneProbe(page);
    await setTier(page, 8, 8);
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: E2E_TAP_HINT_STORAGE_KEY, value: E2E_TAP_HINT_SEEN_VALUE },
    );
    await routeZone(page);
    await walkToWorld(page);
    await waitForCameraRest(page);
    await expect(hint(page)).toHaveCount(0);
  });
});
