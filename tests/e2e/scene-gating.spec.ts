import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { completeWishStep } from "./helpers/wishStep";
import { waitForActiveEvent } from "./helpers/activeEvent";

test.use({ hasTouch: true });

/** String only the three.js renderer chunk contains in the production build (positive control below proves it survives minification). */
const WEBGL_CHUNK_MARKER = "WebGLRenderer";
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
/** Tap left of the 48 px krathong chip (centred at 50 %), on the island/water; the WORLD_EXPLORE positive control proves it hits a mesh. */
const SCENE_TAP_OFFSET_X_PX = 40;
const root = (page: Page) => page.locator("[data-flow-state]");

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

async function expectNoScene(page: Page) {
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(VIEWPORT)).toHaveCount(0);
  await expect(page.locator(".touch-none")).toHaveCount(0);
}

/** Let a click's React commit land before a negative assertion (no fixed sleep). */
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test("3D tier: canvas only in canvas modes; ritual taps never select", async ({ page }) => {
  await mockCreateCreation(page);
  const scriptBodies = collectScriptBodies(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await waitForActiveEvent(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(true);

  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expectNoScene(page);

  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(page.locator("canvas")).toHaveCount(1);
  const box = (await page.locator(VIEWPORT).boundingBox())!;
  const tap = { x: box.x + box.width / 2 - SCENE_TAP_OFFSET_X_PX, y: box.y + box.height / 2 };
  await page.touchscreen.tap(tap.x, tap.y);
  await nextFrames(page);
  await expect(page.locator(VIEWPORT)).not.toHaveAttribute("data-selected-target");

  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-selected-target", /^(krathong|water|lamp)$/);
});

test("FALLBACK_2D: no canvas and no WebGL chunk across the whole flow", async ({ page }) => {
  await mockCreateCreation(page);
  const scriptBodies = collectScriptBodies(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
  await expectNoScene(page);

  await waitForActiveEvent(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await expectNoScene(page);

  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expectNoScene(page);

  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expectNoScene(page);

  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(false);
});
