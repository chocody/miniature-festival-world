import { expect, test, type Page } from "@playwright/test";
import { makeOwnZoneItem } from "./fixtures/findMyFixtures";
import { E2E_CREATION_ID, mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody, makeZoneItem } from "./fixtures/zoneFixtures";
import { openCustomizer } from "./helpers/activeEvent";
import {
  E2E_LIGHT_PRESET_STORAGE_KEY,
  E2E_SECOND_OWN_CREATION_ID,
  E2E_TOGGLE_DAY_LABEL,
  E2E_TOGGLE_NIGHT_LABEL,
  expectHudClearOfRiver,
  hudButtons,
  seedSecondOwnEntry,
} from "./helpers/hud";
import { E2E_MIN_TOUCH_TARGET_PX, E2E_PINNED_TIER_URL, installSceneProbe, locateKrathongById } from "./helpers/sceneProbe";
import { completeWishStep } from "./helpers/wishStep";
import { expectWorldAfterRelease } from "./helpers/release";

// MFW-74 Part A: the world HUD column (Find My picker, day/night toggle, rotate), LOW tier pinned so the FPS watcher cannot step it down.
test.use({ timezoneId: "Asia/Bangkok", viewport: { width: 390, height: 844 } });

const SCENE = '[aria-label="Toy-like night river preview"]';
const ROW = /^\d{1,2} [A-Z]{3} \d{4} \d{2}:\d{2}$/;

async function lowTier(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
  });
}

/** Zone 1 holds filler krathongs plus the user's own one(s) (`second`: the older seeded entry too). */
async function routeWorld(page: Page, second: boolean) {
  await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }));
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const body = makeZoneBody(1, 3);
      body.items.push(makeOwnZoneItem(1, E2E_CREATION_ID, Date.now()));
      if (second) body.items.push({ ...makeZoneItem(1, 60), id: E2E_SECOND_OWN_CREATION_ID });
      return route.fulfill({ json: body });
    },
  );
  await mockCreateCreation(page, { zoneId: 1 });
}

async function walkToWorld(page: Page) {
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(1);
}

test("H1 two own krathongs: the picker lists date + time rows; choosing one brings it into view and closes the picker", async ({ page }) => {
  await lowTier(page);
  await installSceneProbe(page);
  await seedSecondOwnEntry(page);
  await routeWorld(page, true);
  await page.goto(E2E_PINNED_TIER_URL);
  await walkToWorld(page);
  const hud = hudButtons(page);
  await expect(hud.findMy).toBeVisible();
  await hud.findMy.click();
  const rows = page.locator('[data-testid="my-creations-list"] li > button');
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    const text = ((await row.textContent()) ?? "").trim();
    expect(text).toMatch(ROW);
    expect(text).not.toMatch(/MON|TUE|WED|THU|FRI|SAT|SUN|คุ้งน้ำ|กระทงที่/);
  }
  await rows.nth(1).click();
  await expect(page.locator('[data-testid="my-creations-list"]')).toHaveCount(0);
  await expect(page.locator(SCENE)).toHaveAttribute("data-find-my", "following");
  const at = await locateKrathongById(page, E2E_SECOND_OWN_CREATION_ID);
  const box = (await page.locator("canvas").boundingBox())!;
  expect(at.x).toBeGreaterThanOrEqual(box.x);
  expect(at.x).toBeLessThanOrEqual(box.x + box.width);
  expect(at.y).toBeGreaterThanOrEqual(box.y);
  expect(at.y).toBeLessThanOrEqual(box.y + box.height);
});

test("H2 one own krathong: Find My goes straight to it, no picker", async ({ page }) => {
  await lowTier(page);
  await routeWorld(page, false);
  await page.goto(E2E_PINNED_TIER_URL);
  await walkToWorld(page);
  await hudButtons(page).findMy.click();
  await expect(page.locator(SCENE)).toHaveAttribute("data-find-my", "following");
  await expect(page.locator('[data-testid="my-creations-list"]')).toHaveCount(0);
});

test("H4 day/night toggle: follows the clock, then DAY and back to the clock (AUTO)", async ({ page }) => {
  await lowTier(page);
  await page.clock.setFixedTime(new Date("2026-11-26T20:00:00+07:00"));
  await page.goto(E2E_PINNED_TIER_URL);
  await openCustomizer(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  const toggle = hudButtons(page).toggle;
  await expect(page.locator(SCENE)).toHaveAttribute("data-light-preset", "NIGHT");
  await expect(toggle.locator('svg[data-glyph="moon"]')).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label", E2E_TOGGLE_NIGHT_LABEL);
  await expect(toggle).toHaveText("");

  await toggle.click();
  await expect(page.locator(SCENE)).toHaveAttribute("data-light-preset", "DAY");
  await expect(toggle).toHaveAttribute("aria-label", E2E_TOGGLE_DAY_LABEL);
  await expect(toggle.locator('svg[data-glyph="sun"]')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), E2E_LIGHT_PRESET_STORAGE_KEY)).toBe("DAY");

  await toggle.click();
  await expect(page.locator(SCENE)).toHaveAttribute("data-light-preset", "NIGHT");
  expect(await page.evaluate((key) => localStorage.getItem(key), E2E_LIGHT_PRESET_STORAGE_KEY)).toBeNull();
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 1440, height: 900 },
]) {
  test(`H5 HUD column at ${size.width}x${size.height}: 44 px buttons, one column, top left, clear of the river`, async ({ page }) => {
    await page.setViewportSize(size);
    await lowTier(page);
    await installSceneProbe(page);
    await routeWorld(page, false);
    await page.goto(E2E_PINNED_TIER_URL);
    await walkToWorld(page);
    const hud = hudButtons(page);
    await expect(hud.findMy).toBeVisible();
    await expect(hud.toggle).toBeVisible();
    await expect(hud.rotate).toBeVisible();
    const [a, b, c] = [await hud.findMy.boundingBox(), await hud.toggle.boundingBox(), await hud.rotate.boundingBox()];
    for (const box of [a!, b!, c!]) {
      expect(box.width).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
      expect(box.height).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
    }
    expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.x - c!.x)).toBeLessThanOrEqual(1);
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    expect(c!.y).toBeGreaterThanOrEqual(b!.y + b!.height);
    expect(c!.x + c!.width).toBeLessThanOrEqual(size.width / 2);
    expect(c!.y + c!.height).toBeLessThanOrEqual(size.height / 2);
    // MFW-85: the sky launch switch is the 4th button, below rotate (not in hudButtons(): it overlaps the river at 390x844, see follow-ups)
    const sky = page.getByTestId("sky-launch-switch");
    await expect(sky).toBeVisible();
    const d = (await sky.boundingBox())!;
    expect(d.width).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
    expect(d.height).toBeGreaterThanOrEqual(E2E_MIN_TOUCH_TARGET_PX);
    expect(Math.abs(d.x - c!.x)).toBeLessThanOrEqual(1);
    expect(d.y).toBeGreaterThanOrEqual(c!.y + c!.height);
    expect(d.y + d.height).toBeLessThanOrEqual(size.height / 2);
    // owner decision 2026-11-27: overlap accepted at 360x640 and 1440x900; clearance asserted at 390x844 only
    if (size.width === 390) await expectHudClearOfRiver(page);
  });
}
