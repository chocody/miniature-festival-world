import { expect, test, type Page } from "@playwright/test";
import {
  E2E_DESIGN_BUCKET_MESH_BY_ID,
  E2E_DESIGN_GROUP_LABEL,
  E2E_DESIGN_LABELS,
  mockMixedDesignZone,
} from "./fixtures/krathongModels";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { readHeroDesigns } from "./helpers/designProbe";
import { E2E_MIN_TOUCH_TARGET_PX, E2E_PINNED_TIER_URL, installSceneProbe, sceneObjectVisible, waitForKrathongModels } from "./helpers/sceneProbe";
import { completeWishStep } from "./helpers/wishStep";
import { expectWorldAfterRelease } from "./helpers/release";

/**
 * MFW-78 (backlog 14.4): the customizer offers the five owner-supplied designs as thumbnails without text; the chosen design is
 * sent in the appearance, and the river draws each krathong in its design (legacy items without a design as the default).
 * Every check polls a DOM attribute or the scene probe; nothing clicks fixed coordinates.
 */

test.use({ hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");
const LOTUS_FULL_URL = "/models/krathong/lotus_bud_01.full.glb"; // = krathongDesignUrl("lotus_bud_01", "full")
const HTTP_OK = 200;

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function forceHigh(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
}

test.describe("360 px", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("DP1 360 px: five thumbnails, no tabs, no long text", async ({ page }) => {
    await forceHigh(page);
    await page.goto(E2E_PINNED_TIER_URL);
    await waitForActiveEvent(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
    const group = page.getByRole("group", { name: E2E_DESIGN_GROUP_LABEL });
    const tiles = group.getByRole("button");
    await expect(tiles).toHaveCount(5);
    for (const tile of await tiles.all()) {
      const box = (await tile.boundingBox())!;
      expect(Math.round(box.width)).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360 + 0.5);
      expect(await tile.innerText()).toBe("");
    }
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await expect(page.getByTestId("customizer-panel").getByRole("tab")).toHaveCount(0);
  });
});

test.describe("390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("DP2 choose lotus, release, see the designs on the river", async ({ page }) => {
    const errors = collectErrors(page);
    await forceHigh(page);
    await mockMixedDesignZone(page);
    const { requests } = await mockCreateCreation(page, { zoneId: 1 });
    await installSceneProbe(page);
    await page.goto(E2E_PINNED_TIER_URL);
    await waitForActiveEvent(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");

    // 1. Tap lotus: the tile is pressed, its full file loads and the hero shows it.
    const lotusFile = page.waitForResponse((r) => new URL(r.url()).pathname === LOTUS_FULL_URL);
    const lotus = page.getByRole("button", { name: E2E_DESIGN_LABELS.lotus_bud_01, exact: true });
    await lotus.tap();
    await expect(lotus).toHaveAttribute("aria-pressed", "true");
    expect((await lotusFile).status()).toBe(HTTP_OK);
    await expect.poll(() => readHeroDesigns(page)).toEqual(["lotus_bud_01"]);

    // 2. Release: the create request carries the design.
    await page.getByRole("button", { name: "ถัดไป" }).tap();
    await completeWishStep(page);
    await page.getByRole("button", { name: "ปล่อยกระทง" }).tap();
    await expectWorldAfterRelease(page);
    expect(requests).toHaveLength(1);
    expect((requests[0].body.appearance as Record<string, unknown>).design).toBe("lotus_bud_01");

    // 3. The river draws legacy items as banana, plus the lotus and naga buckets; the own krathong keeps lotus.
    await waitForKrathongModels(page);
    for (const id of ["banana_leaf_01", "lotus_bud_01", "naga_01"] as const) {
      await expect.poll(() => sceneObjectVisible(page, E2E_DESIGN_BUCKET_MESH_BY_ID[id]), id).toBe(true);
    }
    for (const id of ["marigold_01", "rose_candles_01"] as const) {
      expect(await sceneObjectVisible(page, E2E_DESIGN_BUCKET_MESH_BY_ID[id]), id).toBe(false);
    }
    await expect.poll(() => readHeroDesigns(page)).toContain("lotus_bud_01");
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
