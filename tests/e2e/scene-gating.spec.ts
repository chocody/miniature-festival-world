import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { completeWishStep } from "./helpers/wishStep";
import { openCustomizer } from "./helpers/activeEvent";
import { sceneZoomScale } from "./helpers/stage";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

/** String only the three.js renderer chunk contains in the production build (positive control below proves it survives minification). */
const WEBGL_CHUNK_MARKER = "WebGLRenderer";
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
/** Tap left of the 48 px krathong chip (centred at 50 %), on the island/water; the WORLD_EXPLORE positive control proves it hits a mesh.
 * Probed at zoom E2E_PROBED_CAMERA_ZOOM; scaled to the framed zoom (MFW-54) it hits the same world point. */
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
  await page.goto(E2E_PINNED_TIER_URL); // keep the forced HIGH tier on slow SwiftShader runners (no runtime step-down)
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await openCustomizer(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(true);

  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expectNoScene(page);

  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(page.locator("canvas")).toHaveCount(1);
  const box = (await page.locator(VIEWPORT).boundingBox())!;
  const scale = await sceneZoomScale(page);
  const tap = { x: box.x + box.width / 2 - SCENE_TAP_OFFSET_X_PX * scale, y: box.y + box.height / 2 };
  await page.touchscreen.tap(tap.x, tap.y);
  await nextFrames(page);
  await expect(page.locator(VIEWPORT)).not.toHaveAttribute("data-selected-target");

  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-selected-target", /^(krathong|water|lamp)$/);
});
