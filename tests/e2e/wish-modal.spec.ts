import { expect, test, type Page } from "@playwright/test";
import {
  CLEAN_WISH,
  completeWishStep,
  WISH_DIALOG_TITLE,
  WISH_PRIVATE_LABEL,
  WISH_PUBLIC_LABEL,
  WISH_SUBMIT_LABEL,
  WISH_TEXT_LABEL,
} from "./helpers/wishStep";

const SMALL_PHONE = { width: 360, height: 640 } as const;
/** Duplicated literal of MIN_TOUCH_TARGET_PX in src/config/customizer.config.ts (do not import src/ into Playwright). */
const MIN_TOUCH_TARGET_PX = 44;
/** Duplicated literal of MODERATION_COPY.reasons.phone in src/config/moderation.config.ts. */
const PHONE_REASON = "มีเบอร์โทรศัพท์อยู่ในข้อความ";
const PII_WISH = "โทรหาฉัน 081-234-5678";

test.use({ viewport: SMALL_PHONE, hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");

async function toWishStep(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Loy Krathong/ }).click();
  await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
}

test("360 px: explicit choice, PII blocked publicly, private allowed, no request, nothing stored", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await toWishStep(page);
  const apiUrls: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    // The ritual loads the shared world with GETs (MFW-23); the wish itself must never be sent here (no write request).
    if (pathname.startsWith("/api/") && r.method() !== "GET") apiUrls.push(r.url());
  });

  await expect(page.getByRole("dialog", { name: WISH_DIALOG_TITLE })).toBeVisible();
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const submit = page.getByRole("button", { name: WISH_SUBMIT_LABEL });
  await expect(submit).toBeDisabled();

  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(PII_WISH);
  await expect(submit).toBeDisabled();
  await page.getByRole("radio", { name: WISH_PUBLIC_LABEL }).check();
  await expect(page.getByTestId("wish-moderation-warning")).toContainText(PHONE_REASON);
  await expect(submit).toBeDisabled();

  const targets = [...(await page.locator("[data-visibility]").all()), submit];
  expect(targets.length).toBe(3);
  for (const el of targets) {
    const box = (await el.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(SMALL_PHONE.width + 0.5);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }

  await page.getByRole("radio", { name: WISH_PRIVATE_LABEL }).check();
  await expect(page.getByTestId("wish-moderation-warning")).toHaveCount(0);
  await submit.click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("081");
  expect(apiUrls).toEqual([]);
  expect(errors).toEqual([]);
});

test("public anonymous wish passes with the hint", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await toWishStep(page);
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(CLEAN_WISH);
  await page.getByRole("radio", { name: WISH_PUBLIC_LABEL }).check();
  await expect(page.getByTestId("wish-public-hint")).toBeVisible();
  await expect(page.getByTestId("wish-moderation-warning")).toHaveCount(0);
  await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  expect(errors).toEqual([]);
});

test("FALLBACK_2D at 360 px: the modal works without a canvas", async ({ page }) => {
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
  await toWishStep(page);
  await expect(page.getByRole("dialog", { name: WISH_DIALOG_TITLE })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  expect(errors).toEqual([]);
});

test("reduced motion: no transition classes in the modal", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
  await toWishStep(page);
  const modal = page.getByTestId("wish-modal");
  await expect(modal).toHaveAttribute("data-reduced-motion", "true");
  await expect(modal.locator('[class*="transition"]')).toHaveCount(0);
  await completeWishStep(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  expect(errors).toEqual([]);
});
