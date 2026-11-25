import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_UI } from "./fixtures/uiFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_MIN_TOUCH_TARGET_PX, E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";
import { SCENE_SELECTOR, forceTier } from "./helpers/stage";
import { CLEAN_WISH, WISH_TEXT_LABEL, completeWishStep } from "./helpers/wishStep";

/**
 * Backlog 10.3 (MFW-55): a minimal UI over the scene. One primary action per step, the scene centre stays visible, HUD
 * surfaces are translucent, every control is a 44 px target, the keyboard walks the flow with a visible focus ring, UI
 * transitions follow reduced motion, and one Thai web font from next/font is applied. The 3D tests force LOW and open
 * E2E_PINNED_TIER_URL, so the FPS watcher never swaps the SwiftShader canvas for 2D mid-test. The FALLBACK_2D and font tests
 * are not pinned.
 */

const NEXT = "ถัดไป";
const RELEASE = "ปล่อยกระทง";
const FIND_MY_BUTTON = "ค้นหาของฉัน";
const PANEL = "แต่งกระทง";
const LIGHT_GROUP = "แสงในฉาก";
const DAY = "กลางวัน";
const PANEL_SLOT = '[data-overlay-slot="panel"]';
const TOP_SLOT = '[data-overlay-slot="top"]';
const PREVIEW = '[data-testid="flat-krathong-preview"]';
const RIVER = '[data-testid="flat-river-view"]';
const CONTROLS =
  '[data-overlay-slot] :is(button, [role="tab"], [role="radio"], [role="switch"], input, textarea), [data-testid="customizer-panel"] :is(button, [role="tab"], [role="radio"], input)';
const PHONE = { width: 390, height: 844 } as const;

const root = (page: Page) => page.locator("[data-flow-state]");

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openLow(page: Page): Promise<string[]> {
  const errors = collectPageErrors(page);
  await mockCreateCreation(page);
  await forceTier(page, 2, 2);
  await page.goto(E2E_PINNED_TIER_URL); // keeps LOW: CI's SwiftShader FPS would otherwise fall back to 2D mid-test
  await waitForActiveEvent(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await expect(page.locator("canvas")).toHaveCount(1);
  return errors;
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

async function visiblePrimaryCount(page: Page): Promise<number> {
  const all = await page.locator(E2E_UI.primarySelector).all();
  let visible = 0;
  for (const el of all) if (await el.isVisible()) visible += 1;
  return visible;
}

async function expectSceneCentreVisible(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (sel) => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest(sel) != null,
        selector,
      ),
    )
    .toBe(true);
}

async function expectTranslucent(locator: Locator) {
  const bg = await locator.first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const m = /rgba?\(([^)]+)\)/.exec(bg);
  expect(m, bg).not.toBeNull();
  const parts = m![1].split(/[\s,/]+/).filter(Boolean);
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  expect(alpha, bg).toBeGreaterThan(0);
  expect(alpha, bg).toBeLessThan(1);
}

async function expectTouchTargets(page: Page) {
  const controls = await page.locator(CONTROLS).all();
  let checked = 0;
  for (const control of controls) {
    if (!(await control.isVisible())) continue;
    const box = (await control.boundingBox())!;
    const label = (await control.getAttribute("aria-label")) ?? (await control.textContent()) ?? "";
    expect(Math.round(box.width), `width of "${label}"`).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
    expect(Math.round(box.height), `height of "${label}"`).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

async function tabTo(page: Page, locator: Locator, max = 40) {
  const handle = await locator.elementHandle();
  for (let i = 0; i < max; i += 1) {
    if (await page.evaluate((el) => document.activeElement === el, handle)) return;
    await page.keyboard.press("Tab");
  }
  if (await page.evaluate((el) => document.activeElement === el, handle)) return;
  throw new Error(`Tab did not reach the element within ${max} presses`);
}

async function expectFocusRing(locator: Locator) {
  const ring = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(ring).toEqual({ style: "solid", width: E2E_UI.focusRingWidth });
}

for (const vp of [
  { width: 390, height: 844, wide: false },
  { width: 1440, height: 900, wide: true },
] as const) {
  test.describe(`${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`[${vp.width}×${vp.height}] 3D: one primary action per step, the scene centre stays visible, overlays are translucent`, async ({
      page,
    }) => {
      const errors = await openLow(page);
      expect(await visiblePrimaryCount(page)).toBe(1);
      await expectSceneCentreVisible(page, SCENE_SELECTOR);
      await expectTranslucent(page.getByRole("region", { name: PANEL }));

      await page.getByRole("button", { name: NEXT }).click();
      await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
      expect(await visiblePrimaryCount(page)).toBe(1);

      await completeWishStep(page);
      await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
      expect(await visiblePrimaryCount(page)).toBe(1);
      await expectSceneCentreVisible(page, SCENE_SELECTOR);
      await expectTranslucent(page.locator(PANEL_SLOT));

      await page.getByRole("button", { name: RELEASE }).click();
      await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
      expect(await visiblePrimaryCount(page)).toBe(0);
      await expectSceneCentreVisible(page, SCENE_SELECTOR);
      await expectTranslucent(page.locator(PANEL_SLOT));
      await expectTranslucent(page.locator(TOP_SLOT));
      expect(errors).toEqual([]);
    });
  });
}

test.describe("390×844 FALLBACK_2D", () => {
  test.use({ viewport: PHONE });

  test("FALLBACK_2D: one primary action per step and the flat view stays visible", async ({ page }) => {
    const errors = collectPageErrors(page);
    await webglOff(page);
    await mockCreateCreation(page);
    await page.goto("/");
    await waitForActiveEvent(page);
    await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
    expect(await visiblePrimaryCount(page)).toBe(1);
    await expectSceneCentreVisible(page, PREVIEW);
    await expectTranslucent(page.getByRole("region", { name: PANEL }));

    await page.getByRole("button", { name: NEXT }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
    expect(await visiblePrimaryCount(page)).toBe(1);

    await completeWishStep(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
    expect(await visiblePrimaryCount(page)).toBe(1);
    await expectSceneCentreVisible(page, RIVER);
    await expectTranslucent(page.locator(PANEL_SLOT));

    await page.getByRole("button", { name: RELEASE }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
    expect(await visiblePrimaryCount(page)).toBe(0);
    await expectSceneCentreVisible(page, RIVER);
    await expectTranslucent(page.locator(PANEL_SLOT));
    await expectTranslucent(page.locator(TOP_SLOT));
    expect(errors).toEqual([]);
  });
});

test.describe("390×844 touch", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test("every visible control is at least MIN_TOUCH_TARGET_PX", async ({ page }) => {
    const errors = await openLow(page);
    const tabs = await page.getByRole("tab").all();
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      await tab.tap();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expectTouchTargets(page);
    }

    await page.getByRole("button", { name: NEXT }).tap();
    await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
    await expectTouchTargets(page);

    await completeWishStep(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
    await expectTouchTargets(page);

    await page.getByRole("button", { name: RELEASE }).tap();
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
    await expectTouchTargets(page);

    await page.getByRole("button", { name: FIND_MY_BUTTON }).tap();
    await expect(page.getByTestId("my-creations")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("owner-wish-controls").first()).toBeVisible();
    await expectTouchTargets(page);
    expect(errors).toEqual([]);
  });
});

test.describe("390×844 keyboard", () => {
  test.use({ viewport: PHONE });

  test("keyboard alone walks the flow with a visible focus ring", async ({ page }) => {
    const errors = await openLow(page);
    const group = page.getByRole("radiogroup", { name: LIGHT_GROUP });
    const checked = group.locator('[role="radio"][aria-checked="true"]');
    await tabTo(page, checked);
    await expectFocusRing(checked);
    await page.keyboard.press("ArrowRight");
    const day = page.getByRole("radio", { name: DAY });
    await expect(day).toBeFocused();
    await expect(day).toHaveAttribute("aria-checked", "true");

    const next = page.getByRole("button", { name: NEXT });
    await tabTo(page, next);
    await expectFocusRing(next);
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");

    await tabTo(page, page.getByRole("textbox", { name: WISH_TEXT_LABEL }));
    await page.keyboard.type(CLEAN_WISH);
    const submit = page.getByRole("button", { name: NEXT });
    await expect(submit).toBeEnabled();
    await tabTo(page, submit);
    await expectFocusRing(submit);
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");

    const release = page.getByRole("button", { name: RELEASE });
    await expect(release).toBeEnabled();
    await tabTo(page, release);
    await expectFocusRing(release);
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");

    const findMy = page.getByRole("button", { name: FIND_MY_BUTTON });
    await tabTo(page, findMy);
    await expectFocusRing(findMy);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("my-creations")).toHaveAttribute("data-open", "true");
    expect(errors).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: PHONE });

  test("reduced motion: UI transitions are off", async ({ page }) => {
    await openLow(page);
    await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
    const duration = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(await duration(page.getByRole("button", { name: NEXT }))).toBe("0s");
    expect(await duration(page.locator('[role="radio"][aria-checked="true"]'))).toBe("0s");
  });
});

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference", viewport: PHONE });

  test("without reduced motion the token duration applies", async ({ page }) => {
    await openLow(page);
    await expect(root(page)).toHaveAttribute("data-reduced-motion", "false");
    const radio = page.locator('[role="radio"][aria-checked="true"]');
    expect(await radio.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(E2E_UI.transitionDuration);
  });
});

test("one Thai web font from next/font is applied", async ({ page }) => {
  await page.goto("/");
  await waitForActiveEvent(page);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded: string[] = [];
    document.fonts.forEach((f) => {
      if (f.status === "loaded") loaded.push(f.family);
    });
    return {
      body: getComputedStyle(document.body).fontFamily,
      loaded,
      lang: document.documentElement.getAttribute("lang"),
    };
  });
  expect(fonts.body).toMatch(E2E_UI.fontFamilyPattern);
  expect(fonts.loaded.some((f) => E2E_UI.fontFamilyPattern.test(f)), fonts.loaded.join(", ")).toBe(true);
  for (const family of fonts.loaded) expect(family).toMatch(E2E_UI.fontFamilyPattern);
  expect(fonts.lang).toBe("th");
});
