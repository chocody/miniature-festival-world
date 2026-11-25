import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_PROBED_CAMERA_ZOOM } from "../fixtures/stageFixtures";

/** Full-screen stage helpers (MFW-54, backlog 10.2). */
export const SCENE_SELECTOR = '[aria-label="Toy-like night river preview"]';

export interface StageViewport {
  readonly width: number;
  readonly height: number;
  readonly wide: boolean;
}

/** Live framed zoom / the zoom older px offsets were probed at: multiply a probed px offset by this to hit the same world point. */
export async function sceneZoomScale(page: Page): Promise<number> {
  const scene = page.locator(SCENE_SELECTOR);
  await expect(scene).toHaveAttribute("data-camera-zoom", /\d/);
  return Number(await scene.getAttribute("data-camera-zoom")) / E2E_PROBED_CAMERA_ZOOM;
}

/** The locator's box is the whole viewport (within 1 px). */
export async function expectFillsViewport(page: Page, locator: Locator): Promise<void> {
  const vp = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      return box !== null && Math.abs(box.x) <= 1 && Math.abs(box.y) <= 1 && Math.abs(box.width - vp.width) <= 1 && Math.abs(box.height - vp.height) <= 1;
    })
    .toBe(true);
  const box = (await locator.boundingBox())!;
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - vp.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - vp.height)).toBeLessThanOrEqual(1);
}

/** No page scroll: the document is no larger than the viewport and a wheel does not move it. */
export async function expectNoPageScroll(page: Page): Promise<void> {
  const size = await page.evaluate(() => {
    const el = document.documentElement;
    return { sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth };
  });
  expect(size.sh).toBeLessThanOrEqual(size.ch);
  expect(size.sw).toBeLessThanOrEqual(size.cw);
  await page.mouse.wheel(0, 400);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
}

/** Phone: a bottom sheet across the full width at the bottom edge. Wide: a side panel on the right, at the top. */
export async function expectPanelPlacement(locator: Locator, vp: StageViewport): Promise<void> {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  if (!vp.wide) {
    expect(Math.round(box.y + box.height)).toBe(vp.height);
    expect(box.x).toBe(0);
    expect(Math.round(box.width)).toBe(vp.width);
    return;
  }
  expect(box.x).toBeGreaterThanOrEqual(vp.width / 2);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y).toBeLessThanOrEqual(24);
  expect(box.width).toBeLessThanOrEqual(400);
  expect(box.height).toBeLessThan(vp.height);
}

/** World controls: a card at the top (phone: inset from both sides; wide: a narrow top-left card). */
export async function expectTopSlotPlacement(page: Page, vp: StageViewport): Promise<void> {
  const top = page.locator('[data-overlay-slot="top"]');
  await expect(top).toBeVisible();
  const box = (await top.boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(24);
  if (!vp.wide) {
    expect(box.width).toBeLessThanOrEqual(vp.width - 20);
    return;
  }
  expect(box.x).toBeLessThanOrEqual(24);
  expect(box.width).toBeLessThanOrEqual(336);
}

/**
 * The first-visit tap hint is visible and nothing covers it: the hint itself takes no touch, so the element under its centre must be
 * the stage (never an overlay slot such as the bottom sheet).
 */
export async function expectTapHintUnoccluded(page: Page): Promise<void> {
  const hint = page.getByTestId("scene-tap-hint");
  await expect(hint).toBeVisible();
  const box = (await hint.boundingBox())!;
  const covered = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el === null || el.closest("[data-overlay-slot]") !== null || el.closest('[data-testid="overlay-layer"]') !== null;
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(covered).toBe(false);
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
}

/** Forces the profiled tier through deviceMemory / hardwareConcurrency (same init script as the other specs). */
export async function forceTier(page: Page, memory: number, cores: number): Promise<void> {
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
}
