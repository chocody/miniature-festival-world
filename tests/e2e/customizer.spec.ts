import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_DESIGN_LABELS } from "./fixtures/krathongModels";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";

/** Backlog 4.2 AC3 width; 640 px is a common small Android height (lead decision). */
const SMALL_PHONE = { width: 360, height: 640 } as const;
/** Duplicated literal of MIN_TOUCH_TARGET_PX in src/config/customizer.config.ts (do not import src/ into Playwright). */
const MIN_TOUCH_TARGET_PX = 44;
const PANEL = "แต่งกระทง";
const VIEW_BUTTONS = ["หมุนซ้าย", "หมุนขวา", "ซูมเข้า", "ซูมออก"];
const VIEWPORT = '[aria-label="Toy-like night river preview"]';

test.use({ viewport: SMALL_PHONE, hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");

async function expectNoHorizontalOverflow(page: Page) {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function expectTargetsFit(panel: Locator) {
  const targets = await panel.getByRole("button").all();
  expect(targets.length).toBeGreaterThan(0);
  for (const el of targets) {
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(SMALL_PHONE.width + 0.5);
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }
}

async function expectPanelAtBottom(page: Page) {
  const panel = page.getByRole("region", { name: PANEL });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(SMALL_PHONE.height);
  expect(box.x).toBe(0);
  expect(Math.round(box.width)).toBe(SMALL_PHONE.width);
  return { panel, box };
}

test("3D tier at 360 px: bottom bar picks a design; rotate and zoom work", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await page.goto(E2E_PINNED_TIER_URL); // keeps forced HIGH (CPU WebGL could step the tier down on a busy runner)
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await waitForActiveEvent(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));

  const { panel, box } = await expectPanelAtBottom(page);
  // Backlog 10.2 AC2 (MFW-54): the bar floats over the full-screen scene instead of sitting below it.
  const viewportBox = (await page.locator(VIEWPORT).boundingBox())!;
  expect(Math.abs(viewportBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewportBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewportBox.width - SMALL_PHONE.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewportBox.height - SMALL_PHONE.height)).toBeLessThanOrEqual(1);
  expect(box.y).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);

  // MFW-78: the five design tiles replace the part tabs.
  for (const name of Object.values(E2E_DESIGN_LABELS)) {
    const tile = page.getByRole("button", { name, exact: true });
    await tile.tap();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expectTargetsFit(panel);
    await expectNoHorizontalOverflow(page);
  }

  for (const name of VIEW_BUTTONS) await page.getByRole("button", { name, exact: true }).tap();
  await expect(page.locator("canvas")).toHaveCount(1);

  await page.getByRole("button", { name: "ถัดไป" }).tap();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expect(page.getByRole("region", { name: PANEL })).toHaveCount(0);
  expect(errors).toEqual([]);
});
