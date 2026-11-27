import { expect, type Page } from "@playwright/test";
import { E2E_RELEASE_TO_WORLD_TIMEOUT_MS } from "../fixtures/ritualRoutes";

/** After the release tap / drop: the flow reaches SHARED_WORLD_EXPLORE (the release flight may outlast the default 5 s on SwiftShader). */
export async function expectWorldAfterRelease(page: Page): Promise<void> {
  await expect(page.locator("[data-flow-state]")).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE", {
    timeout: E2E_RELEASE_TO_WORLD_TIMEOUT_MS,
  });
}
