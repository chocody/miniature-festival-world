import { expect, test, type Locator, type Page } from "@playwright/test";

/** Backlog 4.2 AC3 width; 640 px is a common small Android height (lead decision). */
const SMALL_PHONE = { width: 360, height: 640 } as const;
/** Duplicated literal of MIN_TOUCH_TARGET_PX in src/config/customizer.config.ts (do not import src/ into Playwright). */
const MIN_TOUCH_TARGET_PX = 44;
const PANEL = "แต่งกระทง";
const TABS = ["ฐาน", "ใบตอง", "ดอกไม้", "เทียน"];
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
  const targets = [...(await panel.getByRole("tab").all()), ...(await panel.getByRole("button").all())];
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

const tapTab = async (page: Page, name: string) => {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.tap();
  await expect(tab).toHaveAttribute("aria-selected", "true");
};

const tapOption = async (page: Page, name: string) => {
  const option = page.getByRole("button", { name, exact: true });
  await option.tap();
  await expect(option).toHaveAttribute("aria-pressed", "true");
};

test("3D tier at 360 px: bottom bar picks parts and colours; rotate and zoom work", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await page.getByRole("button", { name: /Loy Krathong/ }).tap();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));

  const { panel, box } = await expectPanelAtBottom(page);
  const viewportBox = (await page.locator(VIEWPORT).boundingBox())!;
  expect(viewportBox.y + viewportBox.height).toBeLessThanOrEqual(box.y);
  await expectNoHorizontalOverflow(page);

  for (const name of TABS) {
    await tapTab(page, name);
    await expectTargetsFit(panel);
    await expectNoHorizontalOverflow(page);
  }

  await tapTab(page, "ฐาน");
  await tapOption(page, "ขนมปัง");
  await tapTab(page, "ใบตอง");
  await tapOption(page, "เขียวเข้ม");
  await tapTab(page, "ดอกไม้");
  await tapOption(page, "กล้วยไม้");
  await expect(page.getByRole("button", { name: "ดาวเรือง", exact: true })).toHaveAttribute("aria-pressed", "false");

  for (const name of VIEW_BUTTONS) await page.getByRole("button", { name, exact: true }).tap();
  await expect(page.locator("canvas")).toHaveCount(1);

  await page.getByRole("button", { name: "ถัดไป" }).tap();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expect(page.getByRole("region", { name: PANEL })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("FALLBACK_2D at 360 px: same bar, no view buttons, no canvas", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
  await page.getByRole("button", { name: /Loy Krathong/ }).tap();
  const { panel } = await expectPanelAtBottom(page);

  for (const name of VIEW_BUTTONS) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".touch-none")).toHaveCount(0);

  for (const name of TABS) {
    await tapTab(page, name);
    await expectTargetsFit(panel);
    await expectNoHorizontalOverflow(page);
  }
  await tapTab(page, "เทียน");
  await tapOption(page, "ส้มอ่อน");

  await page.getByRole("button", { name: "ถัดไป" }).tap();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
  expect(errors).toEqual([]);
});
