import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { completeWishStep } from "./helpers/wishStep";
import { waitForActiveEvent } from "./helpers/activeEvent";

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
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}

test("FALLBACK_2D: starts on the newest zone and pages up- and downstream", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  const requested = await routeZones(page, 3, { 2: 2, 3: 85 });
  await mockCreateCreation(page, { zoneId: 3 }); // registered after the zone routes: handles POST, GET falls back to them
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
  await walkToWorld(page);

  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-zone-id", "3");
  await expect(nav).toHaveAttribute("data-zone-count", "3");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(nav).toHaveAttribute("data-zone-item-count", "80");
  await expect(nav).toContainText("คุ้งน้ำที่ 3 จาก 3");
  expect(requested).toEqual(["3"]);
  await expect(page.getByRole("button", { name: /คุ้งน้ำถัดไป/ })).toHaveCount(0);

  await page.getByRole("button", { name: /คุ้งน้ำก่อนหน้า/ }).click();
  await expect(nav).toHaveAttribute("data-zone-id", "2");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(nav).toHaveAttribute("data-zone-count", "3");
  await expect(nav).toHaveAttribute("data-zone-item-count", "2");
  expect(requested).toEqual(["3", "2"]);

  await page.getByRole("button", { name: /คุ้งน้ำถัดไป/ }).click();
  await expect(nav).toHaveAttribute("data-zone-id", "3");
  await expect(nav).toHaveAttribute("data-zone-item-count", "80");
  expect(requested).toEqual(["3", "2", "3"]);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("3D smoke: the visible zone's krathongs reach the scene", async ({ page }) => {
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
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "ค้นหาของฉัน" })).toBeVisible();
});
