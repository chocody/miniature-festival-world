import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_STAGE_VIEWPORTS, E2E_WATER_TAP_OFFSET_PX, e2eFramedZoom } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import {
  SCENE_SELECTOR,
  expectFillsViewport,
  expectNoPageScroll,
  expectPanelPlacement,
  expectTopSlotPlacement,
  forceTier,
  sceneZoomScale,
  type StageViewport,
} from "./helpers/stage";
import { WISH_DIALOG_TITLE, completeWishStep } from "./helpers/wishStep";

/**
 * Backlog 10.2 (MFW-54): the scene fills the viewport, every control floats on top, the zoom frames the scene at any aspect ratio,
 * and a rotation or resize keeps the camera, the scene and the flow. LOW is forced in the 3D tests: it has no FPS step-down, so the
 * full-screen SwiftShader canvas is never re-created mid-test.
 */

/** String only the three.js renderer chunk contains in the production build (scene-gating.spec.ts proves it survives minification). */
const WEBGL_CHUNK_MARKER = "WebGLRenderer";
const PANEL = "แต่งกระทง";
const RELEASE = "ปล่อยกระทง";
const FIND_MY_BUTTON = "ค้นหาของฉัน";
const CHIP = '[data-input-target="krathong"]';
const PANEL_SLOT = '[data-overlay-slot="panel"]';
const PREVIEW = '[data-testid="flat-krathong-preview"]';
const RIVER = '[data-testid="flat-river-view"]';
const SCROLLER = '[data-testid="flat-river-scroller"]';
const PHONE = { width: 390, height: 844, wide: false } as const;
const PHONE_LANDSCAPE = { width: 844, height: 390, wide: true } as const;
const DESKTOP = { width: 1440, height: 900, wide: true } as const;
const NARROW_WINDOW = { width: 600, height: 800, wide: false } as const;

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator(SCENE_SELECTOR);
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

function collectScriptBodies(page: Page): () => Promise<string[]> {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/_next/static/") && pathname.endsWith(".js")) bodies.push(response.text().catch(() => ""));
  });
  return async () => {
    await page.waitForLoadState("networkidle");
    return Promise.all(bodies);
  };
}

async function webglOff(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

async function expectCameraZoom(page: Page, width: number, height: number) {
  await expect.poll(async () => Number(await scene(page).getAttribute("data-camera-zoom"))).toBeCloseTo(e2eFramedZoom(width, height), 6);
}

async function expectSceneFills(page: Page) {
  await expectFillsViewport(page, scene(page));
  await expectFillsViewport(page, page.locator("canvas"));
}

async function open3D(page: Page) {
  const errors = collectPageErrors(page);
  await mockCreateCreation(page);
  await forceTier(page, 2, 2);
  await page.goto("/");
  await waitForActiveEvent(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await expect(page.locator("canvas")).toHaveCount(1);
  return errors;
}

async function toRitual(page: Page) {
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(page.locator("canvas")).toHaveCount(1);
}

async function releaseToWorld(page: Page) {
  await page.getByRole("button", { name: RELEASE }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
}

/** The water point of scene-gimmicks.spec.ts, scaled to the live framed zoom. */
async function waterPoint(page: Page) {
  const vp = page.viewportSize()!;
  const scale = await sceneZoomScale(page);
  return { x: vp.width / 2 + E2E_WATER_TAP_OFFSET_PX.x * scale, y: vp.height / 2 + E2E_WATER_TAP_OFFSET_PX.y * scale };
}

async function centreOf(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function markCanvas(page: Page) {
  await page.locator("canvas").evaluate((el) => el.setAttribute("data-e2e-mark", "kept"));
}

async function expectCanvasKept(page: Page) {
  await expect(page.locator('canvas[data-e2e-mark="kept"]')).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
}

for (const vp of E2E_STAGE_VIEWPORTS) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });

    test("3D: the scene fills the viewport in every scene step; controls float on top", async ({ page }) => {
      const errors = await open3D(page);
      await expectSceneFills(page);
      await expectNoPageScroll(page);
      await expectPanelPlacement(page.getByRole("region", { name: PANEL }), vp);
      await expectCameraZoom(page, vp.width, vp.height);

      await page.getByRole("button", { name: "ถัดไป" }).click();
      await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
      await expect(page.getByRole("dialog", { name: WISH_DIALOG_TITLE })).toBeVisible();
      await expectNoPageScroll(page);

      await completeWishStep(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
      await expect(page.locator("canvas")).toHaveCount(1);
      await expectSceneFills(page);
      await expectPanelPlacement(page.locator(PANEL_SLOT), vp);
      await expect(page.locator(CHIP)).toBeVisible();
      await expect(page.getByRole("button", { name: RELEASE })).toBeInViewport();

      await releaseToWorld(page);
      await expectSceneFills(page);
      await expectPanelPlacement(page.locator(PANEL_SLOT), vp);
      await expectTopSlotPlacement(page, vp);
      await expectNoPageScroll(page);
      expect(errors).toEqual([]);
    });

    test("3D: overlays take their own taps, the stage the rest", async ({ page }) => {
      const errors = await open3D(page);
      await toRitual(page);
      await releaseToWorld(page);
      const base = Number(await scene(page).getAttribute("data-gimmick-count"));

      const findMy = page.getByRole("button", { name: FIND_MY_BUTTON });
      const findMyBox = (await findMy.boundingBox())!;
      await page.touchscreen.tap(findMyBox.x + findMyBox.width / 2, findMyBox.y + findMyBox.height / 2);
      await expect(page.getByTestId("my-creations")).toHaveAttribute("data-open", "true");
      await nextFrames(page);
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base));
      await expect(scene(page)).not.toHaveAttribute("data-selected-target");
      await page.touchscreen.tap(findMyBox.x + findMyBox.width / 2, findMyBox.y + findMyBox.height / 2);
      await expect(page.getByTestId("my-creations")).toHaveAttribute("data-open", "false");

      const water = await waterPoint(page);
      const onStage = await page.evaluate(
        ({ x, y, selector }) => document.elementFromPoint(x, y)?.closest(selector) !== null,
        { ...water, selector: SCENE_SELECTOR },
      );
      expect(onStage).toBe(true);
      await page.touchscreen.tap(water.x, water.y);
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
      await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");

      const panel = await centreOf(page, PANEL_SLOT);
      await page.touchscreen.tap(panel.x, panel.y);
      await nextFrames(page);
      await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(base + 1));
      expect(errors).toEqual([]);
    });

    test("FALLBACK_2D: the flat view fills the viewport and never loads three", async ({ page }) => {
      const errors = collectPageErrors(page);
      await webglOff(page);
      await mockCreateCreation(page);
      const scriptBodies = collectScriptBodies(page);
      await page.goto("/");
      await waitForActiveEvent(page);
      await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");

      await expectFillsViewport(page, page.locator(PREVIEW));
      await expectNoPageScroll(page);
      await expectPanelPlacement(page.getByRole("region", { name: PANEL }), vp);
      await expect(page.locator(".touch-none")).toHaveCount(0);

      await page.getByRole("button", { name: "ถัดไป" }).click();
      await completeWishStep(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
      const expectRiverFills = async () => {
        await expectFillsViewport(page, page.locator(RIVER));
        await expectNoPageScroll(page);
        await expect
          .poll(() =>
            page.locator(SCROLLER).evaluate((el) => Number(el.querySelector("svg")?.getAttribute("height")) === el.clientHeight),
          )
          .toBe(true);
      };
      await expectRiverFills();
      await expectPanelPlacement(page.locator(PANEL_SLOT), vp);
      await expect(page.getByTestId("flat-own-krathong")).toBeInViewport(); // the pier stays centred at the stage height

      await page.getByRole("button", { name: RELEASE }).click();
      await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
      await expectRiverFills();
      await expectPanelPlacement(page.locator(PANEL_SLOT), vp);
      await expectTopSlotPlacement(page, vp);

      expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(false);
      await expect(page.locator("canvas")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("rotation and resize", () => {
  test.use({ hasTouch: true });

  async function rotateTo(page: Page, vp: StageViewport) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await expectFillsViewport(page, scene(page));
    await expectCameraZoom(page, vp.width, vp.height);
  }

  test("phone rotation keeps the camera, the scene and the flow", async ({ page }) => {
    await page.setViewportSize({ width: PHONE.width, height: PHONE.height });
    const errors = await open3D(page);
    const tab = page.getByRole("tab", { name: "ฐาน", exact: true });
    await tab.tap();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const bread = page.getByRole("button", { name: "ขนมปัง", exact: true });
    await bread.tap();
    await expect(bread).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "ซูมเข้า", exact: true }).tap();
    await markCanvas(page);

    await rotateTo(page, PHONE_LANDSCAPE);
    await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
    await expectCanvasKept(page);
    await expect(bread).toHaveAttribute("aria-pressed", "true");
    await expectPanelPlacement(page.getByRole("region", { name: PANEL }), PHONE_LANDSCAPE);

    await rotateTo(page, PHONE);
    await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
    await expectCanvasKept(page);
    await expect(bread).toHaveAttribute("aria-pressed", "true");
    await expectPanelPlacement(page.getByRole("region", { name: PANEL }), PHONE);

    await toRitual(page);
    await markCanvas(page);
    await rotateTo(page, PHONE_LANDSCAPE);
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
    await expectCanvasKept(page);
    await expect(page.locator(CHIP)).toBeVisible();
    await rotateTo(page, PHONE);
    await releaseToWorld(page);

    const water = await waterPoint(page);
    await page.touchscreen.tap(water.x, water.y);
    await expect(scene(page)).toHaveAttribute("data-selected-target", "water");
    await markCanvas(page);
    const zoneId = await scene(page).getAttribute("data-zone-id");
    await rotateTo(page, PHONE_LANDSCAPE);
    await expect(scene(page)).toHaveAttribute("data-selected-target", "water");
    await expectCanvasKept(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
    expect(await scene(page).getAttribute("data-zone-id")).toBe(zoneId);
    await expectFillsViewport(page, page.locator("canvas"));
    expect(errors).toEqual([]);
  });

  test("desktop resize keeps the camera, the scene and the flow", async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    const errors = await open3D(page);
    await toRitual(page);
    await releaseToWorld(page);
    const water = await waterPoint(page);
    await page.touchscreen.tap(water.x, water.y);
    await expect(scene(page)).toHaveAttribute("data-selected-target", "water");
    await markCanvas(page);

    await rotateTo(page, NARROW_WINDOW);
    await expectCanvasKept(page);
    await expect(scene(page)).toHaveAttribute("data-selected-target", "water");
    await expectPanelPlacement(page.locator(PANEL_SLOT), NARROW_WINDOW);

    await rotateTo(page, DESKTOP);
    await expectCanvasKept(page);
    await expect(scene(page)).toHaveAttribute("data-selected-target", "water");
    await expectPanelPlacement(page.locator(PANEL_SLOT), DESKTOP);
    expect(Number(await scene(page).getAttribute("data-camera-zoom"))).toBeCloseTo(e2eFramedZoom(DESKTOP.width, DESKTOP.height), 6);
    expect(e2eFramedZoom(DESKTOP.width, DESKTOP.height)).toBe(104);
    expect(errors).toEqual([]);
  });
});

test("viewport meta allows the stage under the safe areas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});
