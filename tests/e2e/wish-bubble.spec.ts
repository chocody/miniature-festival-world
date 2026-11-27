import { expect, test, type Page } from "@playwright/test";
import { locateKrathongById } from "./helpers/sceneProbe";
import {
  E2E_BUBBLE_ALIGN_TOLERANCE_PX,
  E2E_BUBBLE_ITEM_ID,
  E2E_BUBBLE_MIN_FOLLOW_PX,
  E2E_BUBBLE_WISH,
  E2E_OTHER_WISH,
  E2E_REPORT_CONFIRM,
  E2E_REPORT_LABEL,
  E2E_REPORT_RECEIVED,
  E2E_WISH_BUBBLE_FADE_MS,
  E2E_WISH_BUBBLE_MARGIN_MS,
  E2E_WISH_BUBBLE_TESTID,
  E2E_WISH_BUBBLE_VISIBLE_MS,
  readBubbleAndKrathong,
  routeOtherKrathongs,
  walkToWorldLow,
} from "./helpers/wishBubble";

/** MFW-80: tapping another person's krathong shows only a fading speech bubble that follows it (production build, SwiftShader, LOW). */
test.use({ hasTouch: true, isMobile: true });

const bubble = (page: Page) => page.getByTestId(E2E_WISH_BUBBLE_TESTID);

test("W1: the bubble shows over the tapped krathong, follows it, fades and leaves no panel", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await routeOtherKrathongs(page);
  await walkToWorldLow(page);

  const point = await locateKrathongById(page, E2E_BUBBLE_ITEM_ID);
  await page.touchscreen.tap(point.x, point.y);
  await expect(bubble(page)).toBeVisible();
  await expect(bubble(page)).toContainText(E2E_BUBBLE_WISH);
  await expect(bubble(page)).not.toContainText(E2E_OTHER_WISH);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-overlay-slot="sheet"]')).toHaveCount(0);

  let s0 = await readBubbleAndKrathong(page, E2E_BUBBLE_ITEM_ID);
  await expect
    .poll(async () => {
      s0 = await readBubbleAndKrathong(page, E2E_BUBBLE_ITEM_ID);
      return s0.bubble !== null && s0.krathong !== null;
    })
    .toBe(true);
  const align = (s: Awaited<ReturnType<typeof readBubbleAndKrathong>>) => {
    expect(s.bubble).not.toBeNull();
    expect(s.krathong).not.toBeNull();
    expect(Math.abs(s.bubble!.cx - s.krathong!.x)).toBeLessThanOrEqual(E2E_BUBBLE_ALIGN_TOLERANCE_PX);
    expect(s.bubble!.bottom).toBeLessThan(s.krathong!.y);
  };
  align(s0);

  let s1 = s0;
  await expect
    .poll(async () => {
      s1 = await readBubbleAndKrathong(page, E2E_BUBBLE_ITEM_ID);
      return s1.krathong !== null && s1.bubble !== null && Math.abs(s1.krathong.x - s0.krathong!.x) >= E2E_BUBBLE_MIN_FOLLOW_PX;
    }, { timeout: E2E_WISH_BUBBLE_VISIBLE_MS, intervals: [250] })
    .toBe(true);
  align(s1);
  const krathongDx = s1.krathong!.x - s0.krathong!.x;
  const bubbleDx = s1.bubble!.cx - s0.bubble!.cx;
  expect(Math.sign(bubbleDx)).toBe(Math.sign(krathongDx));

  await expect(bubble(page)).toHaveAttribute("data-wish-bubble-phase", "fading", {
    timeout: E2E_WISH_BUBBLE_VISIBLE_MS + E2E_WISH_BUBBLE_MARGIN_MS,
  });
  await expect(bubble(page)).toHaveCount(0, { timeout: E2E_WISH_BUBBLE_FADE_MS + E2E_WISH_BUBBLE_MARGIN_MS });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("W2: the report icon on the bubble sends a report for that creation", async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route(
    (url) => url.pathname === "/api/reports",
    async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, json: { ok: true } });
    },
  );
  await routeOtherKrathongs(page);
  await walkToWorldLow(page);

  const point = await locateKrathongById(page, E2E_BUBBLE_ITEM_ID);
  await page.touchscreen.tap(point.x, point.y);
  await expect(bubble(page)).toBeVisible();
  // The bubble follows the drifting krathong: at the ≈ 10 FPS of the CI runner it moves every frame (more than
  // WISH_BUBBLE_MIN_MOVE_PX), so Playwright's click never sees a "stable" element and times out once the bubble fades. Focus pauses
  // the bubble's lifetime (WishBubble B11), the checks below hold right before the click, and the click is dispatched on the button
  // itself. Pointer hit-testing of the moving bubble is therefore not exercised here; the handlers are covered by WishBubble.test.tsx
  // (B5, B6) and WishReportControl's unit tests.
  const report = bubble(page).getByRole("button", { name: E2E_REPORT_LABEL });
  await expect(report).toBeVisible();
  await expect(report).toBeEnabled();
  await report.focus();
  await expect(bubble(page)).toHaveAttribute("data-wish-bubble-phase", "shown");
  await report.dispatchEvent("click");
  // An open report keeps the bubble (WishBubble B5).
  const confirm = bubble(page).getByRole("button", { name: E2E_REPORT_CONFIRM });
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.dispatchEvent("click");
  await expect(bubble(page)).toContainText(E2E_REPORT_RECEIVED);
  expect(bodies).toEqual([{ creationId: E2E_BUBBLE_ITEM_ID }]);
});
