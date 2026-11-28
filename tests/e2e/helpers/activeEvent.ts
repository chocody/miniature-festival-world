import { expect, type Page } from "@playwright/test";
import { E2E_START_CREATE_LABEL } from "../fixtures/landingFixtures";
import { E2E_EVENT_ID } from "../fixtures/zoneFixtures";
import { waitForCameraRest } from "./sceneProbe";

/** The page opens straight into the active event's shared world (MFW-53, MFW-154); data-active-event appears only after hydration. */
export async function waitForLanding(page: Page, eventId: string = E2E_EVENT_ID): Promise<void> {
  const root = page.locator("[data-flow-state]");
  await expect(root).toHaveAttribute("data-active-event", eventId);
  await expect(root).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}

/**
 * MFW-154: lands, presses the start button and waits for the customizer. When the scene probe sees a camera, it also waits for
 * the hand-over flight to land so no scene probe reads the camera mid-flight.
 */
export async function openCustomizer(page: Page): Promise<void> {
  await waitForLanding(page);
  await page.getByRole("button", { name: E2E_START_CREATE_LABEL, exact: true }).click();
  await expect(page.locator("[data-flow-state]")).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await expect(page.locator('[data-testid="customizer-panel"]')).toBeVisible();
  const probed = await page.evaluate(
    () =>
      document.querySelector("canvas") !== null &&
      Boolean((window as unknown as { __mfwProbe?: { camera: unknown } }).__mfwProbe?.camera),
  );
  if (probed) await waitForCameraRest(page);
}
