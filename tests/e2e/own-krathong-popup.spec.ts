import { expect, test, type Page } from "@playwright/test";
import { E2E_DEFAULT_DESIGN, E2E_DESIGN_LABELS, e2eAppearanceWithDesign } from "./fixtures/krathongModels";
import { E2E_OWNER_TOKEN_STORAGE_KEY } from "./fixtures/ritualRoutes";
import { WISH_SWITCH_LABEL } from "./fixtures/wishCopy";
import { routeWishSwitchWorld } from "./fixtures/wishSwitchRoutes";
import { lowTier, openFirstCreationPopup, walkToWorld } from "./helpers/ownKrathongPopup";
import { E2E_PINNED_TIER_URL, installSceneProbe } from "./helpers/sceneProbe";

// MFW-81 (backlog 14.7): the own-krathong popup shows the chosen design's thumbnail instead of the old part list.
test.use({ hasTouch: true });

async function openOwnPopup(page: Page, ownAppearance?: Record<string, unknown>) {
  const errors: Error[] = [];
  const urls: string[] = [];
  page.on("pageerror", (e) => errors.push(e));
  page.on("request", (r) => urls.push(r.url()));
  await lowTier(page);
  await installSceneProbe(page);
  await routeWishSwitchWorld(page, ownAppearance === undefined ? undefined : { ownAppearance });
  await page.goto(E2E_PINNED_TIER_URL);
  await walkToWorld(page);
  const dialog = await openFirstCreationPopup(page);
  return {
    dialog,
    async verify() {
      expect(errors).toEqual([]);
      const token = await page.evaluate((key) => localStorage.getItem(key), E2E_OWNER_TOKEN_STORAGE_KEY);
      expect(token).not.toBeNull();
      expect(await dialog.innerHTML()).not.toContain(token!);
      for (const url of urls) expect(url).not.toContain(token!);
    },
  };
}

test("OP1: own krathong with a design shows its thumbnail, no part list", async ({ page }) => {
  const { dialog, verify } = await openOwnPopup(page, e2eAppearanceWithDesign("naga_01"));
  await expect(dialog.getByTestId("inspect-design")).toHaveAttribute("data-design-id", "naga_01");
  await expect(dialog.getByRole("img", { name: E2E_DESIGN_LABELS.naga_01 })).toBeVisible();
  await expect(dialog.locator("dl")).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: WISH_SWITCH_LABEL })).toBeVisible();
  await verify();
});

test("OP2: pre-14.4 own krathong shows the default design", async ({ page }) => {
  const { dialog, verify } = await openOwnPopup(page);
  await expect(dialog.getByTestId("inspect-design")).toHaveAttribute("data-design-id", E2E_DEFAULT_DESIGN);
  await expect(dialog.getByRole("img", { name: E2E_DESIGN_LABELS[E2E_DEFAULT_DESIGN] })).toBeVisible();
  await expect(dialog.locator("dl")).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: WISH_SWITCH_LABEL })).toBeVisible();
  await verify();
});
