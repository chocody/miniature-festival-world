import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_CREATION_ID } from "../fixtures/ritualRoutes";
import { INSPECT_DIALOG_TITLE } from "../fixtures/wishCopy";
import { waitForActiveEvent } from "./activeEvent";
import { locateKrathongById, waitForCameraRest } from "./sceneProbe";
import { completeWishStep, type WishStepOptions } from "./wishStep";

// Shared by wish-switch.spec.ts (MFW-63), own-krathong-popup.spec.ts and own-popup-screenshots.spec.ts (MFW-81).
const FIND_MY_BUTTON = "ค้นหาของฉัน";
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const root = (page: Page) => page.locator("[data-flow-state]");
const entries = (page: Page) => page.locator('[data-testid="my-creations-list"] li');
const INSPECT_DIALOG = (page: Page) => page.getByRole("dialog", { name: INSPECT_DIALOG_TITLE });

export const inspectDialog = INSPECT_DIALOG;

/**
 * Own krathong popup: the just-released krathong is drawn by the ritual until a reload, so reload, release a second krathong (two entries:
 * Find My opens the picker), choose the older row (the first creation), wait for the camera and tap it.
 */
export async function openFirstCreationPopup(page: Page): Promise<Locator> {
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
export async function lowTier(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
  });
}

export async function walkToWorld(page: Page, text?: string, options: WishStepOptions = {}): Promise<void> {
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page, text, options);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}
