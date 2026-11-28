import { expect, test, type Page } from "@playwright/test";
import { E2E_MAX_SHADER_PROGRAMS } from "./fixtures/perfAudit";
import { E2E_DESIGN_FULL_URL, E2E_DESIGN_ROUTE } from "./fixtures/krathongModels";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { openCustomizer } from "./helpers/activeEvent";
import {
  E2E_DESIGN_BODY_NAME,
  E2E_DESIGN_BUCKET_MESH,
  installSceneProbe,
  readProgramCount,
  sceneHasObject,
  sceneObjectVisible,
  waitForKrathongModels,
} from "./helpers/sceneProbe";
import { completeWishStep } from "./helpers/wishStep";
import { expectWorldAfterRelease } from "./helpers/release";

/**
 * MFW-65 (backlog 13.1): the owner-supplied krathong model files load after the tier is decided, replace the procedural hero and
 * river krathongs, add at most one program variant (LOW stays within E2E_MAX_SHADER_PROGRAMS) and fall back to the procedural model
 * when the files cannot load. Every check polls a DOM attribute or the scene probe.
 */

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function forceTier(page: Page, memory: number, cores: number) {
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
}

test("KE1 CUSTOMIZE: the hero loads the design file and draws the design body", async ({ page }) => {
  const errors = collectErrors(page);
  await forceTier(page, 8, 8);
  await installSceneProbe(page);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === E2E_DESIGN_FULL_URL);
  await page.goto("/");
  await openCustomizer(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  expect((await response).status()).toBe(200);
  await waitForKrathongModels(page);
  await expect.poll(() => sceneHasObject(page, E2E_DESIGN_BODY_NAME)).toBe(true);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test.describe("LOW", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("KE2 LOW: river krathongs draw the design bucket; programs stay within the LOW budget", async ({ page }) => {
    const errors = collectErrors(page);
    await forceTier(page, 2, 2);
    await page.route(
      (url) => url.pathname === "/api/zones",
      (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 2 } }),
    );
    await page.route(
      (url) => url.pathname === "/api/creations",
      (route) => route.fulfill({ json: makeZoneBody(Number(new URL(route.request().url()).searchParams.get("zone") ?? ""), 12) }),
    );
    await mockCreateCreation(page, { zoneId: 2 });
    await installSceneProbe(page);
    await page.goto("/");
    await openCustomizer(page);
    await page.getByRole("button", { name: "ถัดไป" }).click();
    await completeWishStep(page);
    await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
    await expectWorldAfterRelease(page);
    await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
    await expect(scene(page)).not.toHaveAttribute("data-river-item-count", "0");
    await waitForKrathongModels(page);
    await expect.poll(() => sceneObjectVisible(page, E2E_DESIGN_BUCKET_MESH)).toBe(true);
    await nextFrames(page);
    const programs = await readProgramCount(page);
    expect(programs).not.toBeNull();
    expect(programs!).toBeLessThanOrEqual(E2E_MAX_SHADER_PROGRAMS);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test("KE3: when the files cannot load, the procedural krathong stays", async ({ page }) => {
  const errors = collectErrors(page);
  await forceTier(page, 8, 8);
  await page.route(E2E_DESIGN_ROUTE, (route) => route.abort());
  await installSceneProbe(page);
  await page.goto("/");
  await openCustomizer(page);
  await waitForKrathongModels(page, "failed");
  await expect.poll(() => sceneHasObject(page, "candle")).toBe(true);
  expect(await sceneHasObject(page, E2E_DESIGN_BODY_NAME)).toBe(false);
  expect(errors.pageErrors).toEqual([]);
});
