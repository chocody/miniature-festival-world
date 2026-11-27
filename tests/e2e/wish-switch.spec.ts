import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATION_ID, E2E_OWNER_TOKEN_STORAGE_KEY } from "./fixtures/ritualRoutes";
import {
  OWNER_STAYED_PRIVATE,
  PHONE_REASON,
  REPORT_LABEL,
  WISH_SWITCH_LABEL,
} from "./fixtures/wishCopy";
import { routeWishSwitchWorld } from "./fixtures/wishSwitchRoutes";
import { lowTier, openFirstCreationPopup, walkToWorld } from "./helpers/ownKrathongPopup";
import { E2E_PINNED_TIER_URL, installSceneProbe } from "./helpers/sceneProbe";

// MFW-63 (backlog 12.2) × MFW-74: the owner's "เปิดให้ทุกคนเห็น" switch lives in the inspect popup of the user's own krathong (3D);
// the Find My picker only brings a krathong into view.
test.use({ hasTouch: true });

const OPEN_WISH = "ขอให้ทุกคนมีความสุข e2e switch";
const NAME = "น้องมะลิ";
const root = (page: Page) => page.locator("[data-flow-state]");

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
