import { expect, test, type Page } from "@playwright/test";
import { E2E_MY_CREATION_ENTRY_KEYS_SORTED, E2E_MY_CREATIONS_STORAGE_KEY, makeOwnZoneItem } from "./fixtures/findMyFixtures";
import { E2E_CREATION_ID, E2E_OWNER_TOKEN_STORAGE_KEY, mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { completeWishStep } from "./helpers/wishStep";
import { seedSecondOwnEntry } from "./helpers/hud";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import {
  E2E_KRATHONG_MARK_NAME,
  E2E_KRATHONG_MARK_SCALE,
  E2E_PINNED_TIER_URL,
  installSceneProbe,
  listRingAndHaloMeshes,
  readObjectScaleX,
} from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

const NAV = '[data-testid="zone-navigator"]';
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const STATUS = '[data-testid="find-my-status"]';
const FOUND_TEXT = "พบกระทงของคุณแล้ว";
const root = (page: Page) => page.locator("[data-flow-state]");

/** MFW-71: the former 2D tests run on the 3D LOW tier (weak hints), pinned so the FPS watcher cannot change it. */
async function lowTier(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
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
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
}

/** Release into zone 2, move to zone 3, open the drawer. */
async function releaseThenMoveAway(page: Page, withOwnItem: boolean, startUrl = E2E_PINNED_TIER_URL) {
  const requested = await routeZones(page, 3, { 1: 2, 2: 2, 3: 3 }, withOwnItem ? { zoneId: 2, id: E2E_CREATION_ID } : undefined);
  await mockCreateCreation(page, { zoneId: 2 }); // after the zone routes: handles POST only
  await page.goto(startUrl);
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
  // MFW-74: one entry on this device, so the button goes straight to it (no picker).
  await page.getByRole("button", { name: "ค้นหาของฉัน" }).click();
  await expect(page.locator('[data-testid="my-creations-list"]')).toHaveCount(0);
}

test("3D: finds my krathong in another zone", async ({ page }) => {
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT
  await highTier(page);
  await installSceneProbe(page); // MFW-67: mark cue and ring checks
  // Pinned: the HIGH tier must not step down mid-test on a slow SwiftShader runner (the FPS step-down has its own tests).
  const requested = await releaseThenMoveAway(page, true);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  const before = requested.length;
  await openAndSelect(page);
  const nav = page.locator(NAV);
  await expect(nav).toHaveAttribute("data-zone-id", "2");
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  // MFW-58: Find My loads zone 2 into the current stretch; zone streaming also requests neighbour zones, so zone 2 is among the
  // requests after the click rather than necessarily the last one.
  expect(requested.slice(before)).toContain("2");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-selected-target", "riverKrathong");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-find-my", "following");
  // MFW-67: the own krathong (drawn by OwnKrathong) is marked by the steady size-up, without a ring.
  await expect.poll(() => readObjectScaleX(page, E2E_KRATHONG_MARK_NAME)).toBeCloseTo(E2E_KRATHONG_MARK_SCALE, 6);
  await expect.poll(() => listRingAndHaloMeshes(page)).toEqual([]);
  await expect(page.locator(STATUS)).toHaveText(FOUND_TEXT);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("not found when the zone no longer has it", async ({ page }) => {
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT);
  await lowTier(page);
  await releaseThenMoveAway(page, false);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  await openAndSelect(page);
  await expect(page.locator(STATUS)).toHaveText("ไม่พบกระทงนี้บนสายน้ำแล้ว");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(VIEWPORT)).not.toHaveAttribute("data-find-my", "following");
});

test("the release is recorded on this device only", async ({ page }) => {
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT);
  await lowTier(page);
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

  test("the Find My button fits and the picker stays on screen", async ({ page }) => {
    await lowTier(page);
    await seedSecondOwnEntry(page); // two entries: the button opens the picker
    await releaseThenMoveAway(page, true);
    const open = page.getByRole("button", { name: "ค้นหาของฉัน" });
    await expect(open).toBeInViewport();
    await open.click();
    const entry = page.locator('[data-testid="my-creations-list"] li > button').first();
    await expect(entry).toBeVisible();
    const box = (await entry.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });
});
