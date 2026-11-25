import { expect, type Page } from "@playwright/test";
import { E2E_EVENT_ID } from "../fixtures/zoneFixtures";

/** The page opens straight into the active event (MFW-53); data-active-event appears only after hydration. */
export async function waitForActiveEvent(page: Page, eventId: string = E2E_EVENT_ID): Promise<void> {
  const root = page.locator("[data-flow-state]");
  await expect(root).toHaveAttribute("data-active-event", eventId);
  await expect(root).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
}
