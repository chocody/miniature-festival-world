import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { openCustomizer } from "./helpers/activeEvent";
import { lowTier } from "./helpers/ownKrathongPopup";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";
import { WISH_SUBMIT_LABEL, WISH_SWITCH_LABEL, WISH_TEXT_LABEL } from "./helpers/wishStep";
import { expectWorldAfterRelease } from "./helpers/release";

/** MFW-83: the design bar floats centred above the bottom edge; the wish switch is symmetric in both states; no visible "คุ้งน้ำ". */
const root = (page: Page) => page.locator("[data-flow-state]");
const MIN_TOUCH = 44; // = MIN_TOUCH_TARGET_PX (duplicated literal: e2e fixtures never import app code)
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 1440, height: 900 },
] as const;

async function open(page: Page) {
  await lowTier(page);
  await mockCreateCreation(page, { zoneId: 1 });
  await page.goto(E2E_PINNED_TIER_URL);
  await openCustomizer(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
}

for (const vp of VIEWPORTS) {
  test(`[${vp.width}×${vp.height}] the design bar is centred, floats above the bottom edge and is not a full-width sheet`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page);
    const panel = page.getByTestId("customizer-panel");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThanOrEqual(1); // centred
    const gap = vp.height - (box.y + box.height);
    expect(gap).toBeGreaterThanOrEqual(8); // floating: a visible gap above the bottom edge
    expect(gap).toBeLessThanOrEqual(40);
    expect(box.width).toBeLessThanOrEqual(vp.width - 16); // never a full-width sheet
    expect(box.x).toBeGreaterThanOrEqual(8);
    const tiles = await panel.locator("[data-design-id]").all();
    expect(tiles).toHaveLength(5);
    for (const tile of tiles) {
      const t = (await tile.boundingBox())!;
      expect(t.width).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(t.height).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(t.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(t.x + t.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
  });
}

test("[360×640] the wish switch is symmetric in both states; the world shows no zone name and keeps the zone arrows", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 3 } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => route.fulfill({ json: makeZoneBody(Number(new URL(route.request().url()).searchParams.get("zone") ?? "1"), 2) }),
  );
  await open(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill("ขอให้ทุกคนมีความสุข");
  const sw = page.getByRole("switch", { name: WISH_SWITCH_LABEL });
  const knob = page.getByTestId("wish-switch-knob");
  for (const checked of [false, true]) {
    await expect(sw).toHaveAttribute("aria-checked", String(checked));
    const t = (await sw.boundingBox())!;
    const k = (await knob.boundingBox())!;
    const left = k.x - t.x;
    const right = t.x + t.width - (k.x + k.width);
    const top = k.y - t.y;
    const bottom = t.y + t.height - (k.y + k.height);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((checked ? right : left) - top)).toBeLessThanOrEqual(0.5); // the resting side has the same inset as top and bottom
    expect(left).toBeGreaterThanOrEqual(0); // fully inside the track
    expect(right).toBeGreaterThanOrEqual(0);
    expect(t.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    if (!checked) await sw.click();
  }
  await page.getByRole("button", { name: WISH_SUBMIT_LABEL }).click();
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.getByTestId("zone-navigator")).toHaveAttribute("data-zone-count", "3");
  await expect(page.getByRole("button", { name: /คุ้งน้ำถัดไป/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ })).toBeVisible();
  // The top card: right of the HUD column, near the top, inside the viewport, translucent (moved here from minimal-ui / full-screen-stage).
  const top = page.locator('[data-overlay-slot="top"]');
  await expect(top).toBeVisible();
  const tb = (await top.boundingBox())!;
  expect(tb.y).toBeLessThanOrEqual(24);
  expect(tb.x).toBeGreaterThanOrEqual(44);
  expect(tb.x + tb.width).toBeLessThanOrEqual(360);
  const bg = await top.evaluate((el) => getComputedStyle(el).backgroundColor);
  const parts = (/rgba?\(([^)]+)\)/.exec(bg)?.[1] ?? "").split(/[\s,/]+/).filter(Boolean);
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  expect(alpha, bg).toBeGreaterThan(0);
  expect(alpha, bg).toBeLessThan(1);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain("คุ้งน้ำ");
});
