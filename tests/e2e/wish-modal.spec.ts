import { expect, test, type Page } from "@playwright/test";
import {
  CLEAN_WISH,
  completeWishStep,
  WISH_DIALOG_TITLE,
  WISH_NAME_LABEL,
  WISH_SUBMIT_LABEL,
  WISH_SWITCH_LABEL,
  WISH_TEXT_LABEL,
} from "./helpers/wishStep";
import { PHONE_REASON } from "./fixtures/wishCopy";
import { waitForActiveEvent } from "./helpers/activeEvent";

const SMALL_PHONE = { width: 360, height: 640 } as const;
/** Duplicated literal of MIN_TOUCH_TARGET_PX in src/config/customizer.config.ts (do not import src/ into Playwright). */
const MIN_TOUCH_TARGET_PX = 44;
/** Duplicated literal of MODERATION_COPY.reasons.email in src/config/moderation.config.ts. */
const EMAIL_REASON = "มีอีเมลอยู่ในข้อความ";
const PII_WISH = "โทรหาฉัน 081-234-5678";
const PII_NAME = "someone@example.com";

test.use({ viewport: SMALL_PHONE, hasTouch: true });

const root = (page: Page) => page.locator("[data-flow-state]");

async function toWishStep(page: Page) {
  await page.goto("/");
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
}

test("360 px: name + switch, off by default, PII blocked when on, private allowed, no request, nothing stored", async ({ page }) => {
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
  const sw = page.getByRole("switch", { name: WISH_SWITCH_LABEL });
  const name = page.getByRole("textbox", { name: WISH_NAME_LABEL });
  const warning = page.getByTestId("wish-moderation-warning");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(submit).toBeDisabled();

  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(PII_WISH);
  await expect(submit).toBeEnabled(); // private: the wish text is not moderated
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(warning).toContainText(PHONE_REASON);
  await expect(submit).toBeDisabled();

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(warning).toHaveCount(0);
  await name.fill(PII_NAME); // the name is checked even when private
  await expect(warning).toContainText(EMAIL_REASON);
  await expect(submit).toBeDisabled();
  await name.fill("");
  await expect(warning).toHaveCount(0);

  const targets = [name, sw, submit];
  for (const el of targets) {
    const box = (await el.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(SMALL_PHONE.width + 0.5);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }
  const [scrollWidthAfter, clientWidthAfter] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidthAfter).toBeLessThanOrEqual(clientWidthAfter);

  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("081");
  expect(stored).not.toContain(PII_NAME);
  expect(apiUrls).toEqual([]);
  expect(errors).toEqual([]);
});

test("switch on shows the helper and the public hint", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (e) => errors.push(e));
  await toWishStep(page);
  const sw = page.getByRole("switch", { name: WISH_SWITCH_LABEL });
  await expect(sw).toHaveAccessibleDescription(/ชื่อและคำอธิษฐาน/);
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(CLEAN_WISH);
  await expect(page.getByTestId("wish-public-hint")).toHaveCount(0);
  await sw.click();
  await expect(page.getByTestId("wish-public-hint")).toBeVisible();
  await expect(page.getByTestId("wish-moderation-warning")).toHaveCount(0);
  await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).click();
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
