import { expect, test, type Page } from "@playwright/test";
import { E2E_MY_CREATION_ENTRY_KEYS_SORTED, E2E_MY_CREATIONS_STORAGE_KEY, makeOwnZoneItem } from "./fixtures/findMyFixtures";
import { E2E_CREATION_ID, E2E_OWNER_TOKEN_STORAGE_KEY, mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { completeWishStep } from "./helpers/wishStep";

const NAV = '[data-testid="zone-navigator"]';
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const STATUS = '[data-testid="find-my-status"]';
const FOUND_TEXT = "พบกระทงของคุณที่คุ้งน้ำที่ 2";
const root = (page: Page) => page.locator("[data-flow-state]");

async function webglOff(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

async function highTier(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8, configurable: true });
  });
}

/** Intercepts both zone endpoints; `own` adds the user's krathong to its zone. Returns the zone ids requested, in order. */
async function routeZones(
  page: Page,
  zoneCount: number,
  sizes: Record<number, number>,
  own?: { zoneId: number; id: string },
): Promise<string[]> {
  const requested: string[] = [];
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      const zone = Number(new URL(route.request().url()).searchParams.get("zone") ?? "");
      requested.push(String(zone));
      const body = makeZoneBody(zone, sizes[zone] ?? 0);
      if (own && own.zoneId === zone) body.items.push(makeOwnZoneItem(zone, own.id, Date.now()));
      return route.fulfill({ json: body });
    },
  );
  return requested;
}

async function walkToWorld(page: Page) {
  await page.getByRole("button", { name: /Loy Krathong/ }).click();
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
}

/** Release into zone 2, move to zone 3, open the drawer. */
async function releaseThenMoveAway(page: Page, withOwnItem: boolean) {
  const requested = await routeZones(page, 3, { 1: 2, 2: 2, 3: 3 }, withOwnItem ? { zoneId: 2, id: E2E_CREATION_ID } : undefined);
  await mockCreateCreation(page, { zoneId: 2 }); // after the zone routes: handles POST only
  await page.goto("/");
  await walkToWorld(page);
  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-zone-id", "2");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await page.getByRole("button", { name: /คุ้งน้ำถัดไป/ }).click();
  await expect(nav).toHaveAttribute("data-zone-id", "3");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  return requested;
}

async function openAndSelect(page: Page) {
  await page.getByRole("button", { name: "ค้นหาของฉัน" }).click();
  const entries = page.locator('[data-testid="my-creations-list"] li button');
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText("คุ้งน้ำที่ 2");
  await entries.first().click();
}

test("3D: finds my krathong in another zone", async ({ page }) => {
  await highTier(page);
  const requested = await releaseThenMoveAway(page, true);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await openAndSelect(page);
  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-zone-id", "2");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  expect(requested[requested.length - 1]).toBe("2");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-selected-target", "riverKrathong");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-find-my", "following");
  await expect(page.locator(STATUS)).toHaveText(FOUND_TEXT);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("FALLBACK_2D: finds my krathong in another zone", async ({ page }) => {
  await webglOff(page);
  await releaseThenMoveAway(page, true);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "FALLBACK_2D");
  await openAndSelect(page);
  await expect(page.locator(NAV)).toHaveAttribute("data-zone-id", "2");
  await expect(page.locator(STATUS)).toHaveText(FOUND_TEXT);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("not found when the zone no longer has it", async ({ page }) => {
  await webglOff(page);
  await releaseThenMoveAway(page, false);
  await openAndSelect(page);
  await expect(page.locator(STATUS)).toHaveText("ไม่พบกระทงนี้บนสายน้ำแล้ว");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-find-my]")).toHaveCount(0);
});

test("the release is recorded on this device only", async ({ page }) => {
  await webglOff(page);
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await releaseThenMoveAway(page, true);
  const { raw, token } = await page.evaluate(
    ([listKey, tokenKey]) => ({ raw: localStorage.getItem(listKey), token: localStorage.getItem(tokenKey) }),
    [E2E_MY_CREATIONS_STORAGE_KEY, E2E_OWNER_TOKEN_STORAGE_KEY],
  );
  const list = JSON.parse(raw!) as Record<string, unknown>[];
  expect(list).toHaveLength(1);
  expect(Object.keys(list[0]).sort()).toEqual([...E2E_MY_CREATION_ENTRY_KEYS_SORTED]);
  expect(list[0].id).toBe(E2E_CREATION_ID);
  expect(token).not.toBeNull();
  expect(raw).not.toContain(token!);
  expect(raw!.toLowerCase()).not.toContain("wish");
  await openAndSelect(page);
  await expect(page.locator(STATUS)).toHaveText(FOUND_TEXT);
  for (const url of urls) {
    expect(url).not.toContain(E2E_CREATION_ID);
    expect(url).not.toContain(token!);
  }
});

test.describe("360 px", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("the drawer fits", async ({ page }) => {
    await webglOff(page);
    await releaseThenMoveAway(page, true);
    const open = page.getByRole("button", { name: "ค้นหาของฉัน" });
    await expect(open).toBeInViewport();
    await open.click();
    const entry = page.locator('[data-testid="my-creations-list"] li button').first();
    await expect(entry).toBeVisible();
    const box = (await entry.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });
});
