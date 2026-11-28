import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { completeWishStep } from "./helpers/wishStep";
import { openCustomizer } from "./helpers/activeEvent";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_WORLD_ROTATE_BUTTON_NAME } from "./helpers/cameraProbe";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

/** Accessible-name filter: every button except the 3D world rotate button (MFW-57). */
const NOT_WORLD_ROTATE_BUTTON = new RegExp(`^(?!${E2E_WORLD_ROTATE_BUTTON_NAME}$)`);

const NAV = '[data-testid="zone-navigator"]';
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const root = (page: Page) => page.locator("[data-flow-state]");

/** Intercepts both zone endpoints with fixtures; returns the zone ids requested from /api/creations, in order. */
async function routeZones(page: Page, zoneCount: number, sizes: Record<number, number>): Promise<string[]> {
  const requested: string[] = [];
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      const zone = new URL(route.request().url()).searchParams.get("zone") ?? "";
      requested.push(zone);
      return route.fulfill({ json: makeZoneBody(Number(zone), sizes[Number(zone)] ?? 0) });
    },
  );
  return requested;
}

async function walkToWorld(page: Page) {
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
}

test("3D LOW: starts on the newest zone; a full zone shows 80 of 85", async ({ page }) => {
  // MFW-71: the former 2D paging test. Reduced motion makes the ‹ button an instant camera cut; the 3D scene also streams the
  // neighbour zones, so the request list is not asserted (endless-river.spec.ts covers travel and wrap-around).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
  });
  await routeZones(page, 3, { 2: 2, 3: 85 });
  await mockCreateCreation(page, { zoneId: 3 }); // registered after the zone routes: handles POST, GET falls back to them
  await page.goto(E2E_PINNED_TIER_URL); // pinned: the FPS watcher cannot step the tier down mid-test
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await walkToWorld(page);

  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-zone-id", "3");
  await expect(nav).toHaveAttribute("data-zone-count", "3");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(nav).toHaveAttribute("data-zone-item-count", "80");
  await expect(nav).not.toContainText("คุ้งน้ำ"); // MFW-83: no visible zone name
  // MFW-58 (open question 37): the river wraps, so at zone 3 of 3 the next button exists (it leads to zone 1).
  await expect(page.getByRole("button", { name: /คุ้งน้ำถัดไป/ })).toHaveCount(1);

  await page.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ }).click();
  await expect(nav).toHaveAttribute("data-zone-id", "2");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(nav).toHaveAttribute("data-zone-count", "3");
  await expect(nav).toHaveAttribute("data-zone-item-count", "2");
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("3D smoke: the visible zone's krathongs reach the scene", async ({ page }) => {
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
  await routeZones(page, 1, { 1: 3 });
  await mockCreateCreation(page);
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await walkToWorld(page);
  const viewport = page.locator(VIEWPORT);
  await expect(viewport).toHaveAttribute("data-river-item-count", "3");
  await expect(viewport).toHaveAttribute("data-zone-id", "1");
  await expect(page.locator("canvas")).toHaveCount(1);
  // MFW-57 / MFW-74 / MFW-85: the HUD column holds the rotate button (open question 34), Find My, the day/night toggle and the
  // sky-launch switch; every other button stays absent.
  await expect(page.getByRole("button", { name: NOT_WORLD_ROTATE_BUTTON })).toHaveCount(4); // Find My + day/night toggle + sky-launch switch (MFW-85) + the start button, MFW-154
  await expect(page.getByTestId("sky-launch-switch")).toBeVisible();
  await expect(page.getByRole("button", { name: "ค้นหาของฉัน" })).toBeVisible();
});
