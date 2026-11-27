import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATION_ID, E2E_OWNER_TOKEN_STORAGE_KEY } from "./fixtures/ritualRoutes";
import {
  INSPECT_DIALOG_TITLE,
  OWNER_STAYED_PRIVATE,
  PHONE_REASON,
  REPORT_LABEL,
  WISH_SWITCH_LABEL,
} from "./fixtures/wishCopy";
import { routeWishSwitchWorld } from "./fixtures/wishSwitchRoutes";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL, installSceneProbe, locateKrathongById, waitForCameraRest } from "./helpers/sceneProbe";
import { completeWishStep, type WishStepOptions } from "./helpers/wishStep";

// MFW-63 (backlog 12.2) × MFW-74: the owner's "เปิดให้ทุกคนเห็น" switch lives in the inspect popup of the user's own krathong (3D);
// the Find My picker only brings a krathong into view.
test.use({ hasTouch: true });

const OPEN_WISH = "ขอให้ทุกคนมีความสุข e2e switch";
const NAME = "น้องมะลิ";
const FIND_MY_BUTTON = "ค้นหาของฉัน";
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const root = (page: Page) => page.locator("[data-flow-state]");
const entries = (page: Page) => page.locator('[data-testid="my-creations-list"] li');
const INSPECT_DIALOG = (page: Page) => page.getByRole("dialog", { name: INSPECT_DIALOG_TITLE });

/**
 * Own krathong popup: the just-released krathong is drawn by the ritual until a reload, so reload, release a second krathong (two entries:
 * Find My opens the picker), choose the older row (the first creation), wait for the camera and tap it.
 */
async function openFirstCreationPopup(page: Page) {
  await page.reload();
  await walkToWorld(page);
  await page.getByRole("button", { name: FIND_MY_BUTTON }).click();
  await expect(entries(page)).toHaveCount(2);
  await entries(page).nth(1).locator("button").first().click();
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-find-my", "following");
  await expect(page.locator('[data-testid="my-creations-list"]')).toHaveCount(0); // choosing a row closes the picker
  await waitForCameraRest(page);
  const at = await locateKrathongById(page, E2E_CREATION_ID);
  await page.touchscreen.tap(at.x, at.y);
  const dialog = INSPECT_DIALOG(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** LOW tier (same weak-device signal as device-profiler.spec.ts): a real 3D canvas that is cheap enough under SwiftShader on a loaded runner. */
async function lowTier(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
  });
}

async function walkToWorld(page: Page, text?: string, options: WishStepOptions = {}) {
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page, text, options);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}

/** Every page error and every request URL, checked at the end of each test. */
function watch(page: Page) {
  const errors: Error[] = [];
  const urls: string[] = [];
  page.on("pageerror", (e) => errors.push(e));
  page.on("request", (r) => urls.push(r.url()));
  return {
    async verify() {
      expect(errors).toEqual([]);
      const token = await page.evaluate((key) => localStorage.getItem(key), E2E_OWNER_TOKEN_STORAGE_KEY);
      expect(token).not.toBeNull();
      const secrets = [token!, NAME, OPEN_WISH, encodeURIComponent(NAME), encodeURIComponent(OPEN_WISH)];
      for (const url of urls) for (const secret of secrets) expect(url).not.toContain(secret);
    },
  };
}

async function deviceStorage(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

test("3D (LOW tier): create open with a name; after a reload the popup switches it to private and back", async ({ page }) => {
  const watcher = watch(page);
  await lowTier(page);
  await installSceneProbe(page);
  const world = await routeWishSwitchWorld(page);
  await page.goto(E2E_PINNED_TIER_URL); // pinned: the FPS watcher cannot step the tier down mid-test
  await walkToWorld(page, OPEN_WISH, { open: true, name: NAME });
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await expect(page.locator("canvas")).toHaveCount(1);

  // 2. The create body carries the open wish and the name.
  expect(world.creates).toHaveLength(1);
  expect(world.creates[0].body).toMatchObject({ wishVisibility: "public", displayName: NAME, wishText: OPEN_WISH });
  // 3. Neither is kept on the device.
  const stored = await deviceStorage(page);
  expect(stored).not.toContain(NAME);
  expect(stored).not.toContain(OPEN_WISH);

  // 4. After a reload the state is read from the server again: the popup of the first krathong shows the switch on.
  const dialog = await openFirstCreationPopup(page);
  const popupSwitch = dialog.getByRole("switch", { name: WISH_SWITCH_LABEL });
  await expect(popupSwitch).toHaveAttribute("aria-checked", "true");

  // 5. Switch to private: the token goes only in the POST body; the popup shows only the krathong again.
  await popupSwitch.click();
  await expect(popupSwitch).toHaveAttribute("aria-checked", "false");
  expect(world.switches).toHaveLength(1);
  const sent = world.switches[0];
  const sentUrl = new URL(sent.url);
  expect(sentUrl.pathname).toBe("/api/wish-visibility");
  expect(sentUrl.search).toBe("");
  expect(Object.keys(sent.body).sort()).toEqual(["creationId", "open", "ownerToken"]);
  expect(sent.body.creationId).toBe(E2E_CREATION_ID);
  expect(sent.body.open).toBe(false);
  const token = await page.evaluate((key) => localStorage.getItem(key), E2E_OWNER_TOKEN_STORAGE_KEY);
  expect(sent.body.ownerToken).toBe(token);
  expect(world.isOpen(E2E_CREATION_ID)).toBe(false);
  await expect(dialog).not.toContainText(NAME);
  await expect(dialog).not.toContainText(OPEN_WISH);
  await expect(dialog.getByRole("button", { name: REPORT_LABEL, exact: true })).toHaveCount(0);

  // 6. Switch back on from the popup: name + wish + Report show at once.
  await popupSwitch.click();
  await expect(popupSwitch).toHaveAttribute("aria-checked", "true");
  await expect(dialog).toContainText(NAME);
  await expect(dialog).toContainText(OPEN_WISH);
  await expect(dialog.getByRole("button", { name: REPORT_LABEL, exact: true })).toBeVisible();
  expect(world.isOpen(E2E_CREATION_ID)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  await watcher.verify();
});

test("3D (LOW tier): create open, switch to private and switch back from the popup", async ({ page }) => {
  const watcher = watch(page);
  await lowTier(page);
  await installSceneProbe(page); // the owner popup is opened by tapping the krathong
  const world = await routeWishSwitchWorld(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await walkToWorld(page, OPEN_WISH, { open: true, name: NAME });
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await expect(page.locator("canvas")).toHaveCount(1); // the 3D scene is mounted before the switch is used
  const dialog = await openFirstCreationPopup(page);
  const sw = dialog.getByRole("switch", { name: WISH_SWITCH_LABEL });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toBeEnabled();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(world.switches.map((s) => s.body.open)).toEqual([false, true]);
  expect(world.isOpen(E2E_CREATION_ID)).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  await watcher.verify();
});

test("3D (LOW tier): a moderation rejection on open shows the reasons and the wish stays private", async ({ page }) => {
  const watcher = watch(page);
  await lowTier(page);
  await installSceneProbe(page); // the owner popup is opened by tapping the krathong
  const world = await routeWishSwitchWorld(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await walkToWorld(page, undefined, { name: NAME });
  const dialog = await openFirstCreationPopup(page);
  const sw = dialog.getByRole("switch", { name: WISH_SWITCH_LABEL });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  world.rejectNextOpen(["phone"]);
  await sw.click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText(PHONE_REASON);
  await expect(alert).toContainText(OWNER_STAYED_PRIVATE);
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toBeEnabled();
  expect(world.isOpen(E2E_CREATION_ID)).toBe(false);
  expect(world.switches).toHaveLength(1);
  await watcher.verify();
});
