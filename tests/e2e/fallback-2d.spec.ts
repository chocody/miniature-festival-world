import { expect, test, type Page } from "@playwright/test";
import { makeOwnZoneItem } from "./fixtures/findMyFixtures";
import { E2E_CREATION_ID, mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { E2E_FLAT_RIVER_PROBED_HEIGHT_PX, E2E_LIGHT_PRESET_STORAGE_KEY } from "./fixtures/stageFixtures";
import { completeWishStep } from "./helpers/wishStep";
import { waitForActiveEvent } from "./helpers/activeEvent";

test.use({ hasTouch: true });

/** String only the three.js renderer chunk contains in the production build (scene-gating.spec.ts proves it survives minification). */
const WEBGL_CHUNK_MARKER = "WebGLRenderer";
const PREVIEW = '[data-testid="flat-krathong-preview"]';
const RIVER = '[data-testid="flat-river-view"]';
const SCROLLER = '[data-testid="flat-river-scroller"]';
const ITEMS = '[data-testid="flat-river-item"]';
/** Duplicate of INSPECT_POPUP_COPY.dialogTitle (src/config/inspect.config.ts); do not import src/ into Playwright. */
const INSPECT_DIALOG_TITLE = "กระทงในสายน้ำ";
const FIND_MY_BUTTON = "ค้นหาของฉัน";
const FIND_MY_TOLERANCE_PX = 16; // ≈ 2 s of drift at 2D scale
const ZONE_ITEM_COUNT = 5;
const WATER_PROBE_FRACTIONS = [0.3, 0.35, 0.4, 0.6, 0.65, 0.7];
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

function collectScriptBodies(page: Page): () => Promise<string[]> {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/_next/static/") && pathname.endsWith(".js")) bodies.push(response.text().catch(() => ""));
  });
  return async () => {
    await page.waitForLoadState("networkidle");
    return Promise.all(bodies);
  };
}

/** Zone 1 with five items plus the user's own krathong (as the server returns it after the release). */
async function routeZones(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      if (route.request().method() !== "POST") {
        const body = makeZoneBody(1, ZONE_ITEM_COUNT);
        body.items.push(makeOwnZoneItem(1, E2E_CREATION_ID, Date.now()));
        return route.fulfill({ json: body });
      }
      return route.fallback();
    },
  );
}

async function setUp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await webglOff(page);
  await mockCreateCreation(page);
  await routeZones(page);
  return errors;
}

async function walkToWorld(page: Page) {
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator(RIVER)).toBeVisible();
}

const translateX = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => Number(/translate\(([-\d.e]+) /.exec(el.getAttribute("transform") ?? "")?.[1] ?? Number.NaN));

test("FALLBACK_2D customizer previews the krathong in flat vector", async ({ page }) => {
  const errors = await setUp(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  await waitForActiveEvent(page);
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await expect(page.locator(`${PREVIEW} svg`)).toBeVisible();
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-krathong-base", "banana_trunk_01");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".touch-none")).toHaveCount(0);
  await page.getByText("กลีบบัว").first().click();
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-krathong-base", "lotus_petal_01");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
  expect(errors).toEqual([]);
});

test("FALLBACK_2D river shows the zone and drifts", async ({ page }) => {
  const errors = await setUp(page);
  const scriptBodies = collectScriptBodies(page);
  await page.goto("/");
  await walkToWorld(page);
  await expect(page.locator(`${ITEMS}:not([data-own])`)).toHaveCount(ZONE_ITEM_COUNT);
  await expect(page.locator('[data-own="true"]')).toHaveCount(1);
  await expect(page.locator('[data-own="true"]')).toHaveAttribute("data-creation-id", E2E_CREATION_ID);
  const x0 = await translateX(page, `${ITEMS}:not([data-own])`);
  await expect.poll(() => translateX(page, `${ITEMS}:not([data-own])`)).toBeGreaterThan(x0);
  const widths = await page.locator(SCROLLER).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(widths.scroll).toBeGreaterThan(widths.client);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(false);
  expect(errors).toEqual([]);
});

test("tap on the water ripples", async ({ page }) => {
  await setUp(page);
  await page.goto("/");
  await walkToWorld(page);
  const point = await page.locator(SCROLLER).evaluate((el, fractions) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    for (const f of fractions) {
      const y = r.top + r.height * f;
      if (document.elementFromPoint(x, y)?.getAttribute("data-input-target") === "water") return { x, y };
    }
    return null;
  }, WATER_PROBE_FRACTIONS);
  expect(point).not.toBeNull();
  await page.touchscreen.tap(point!.x, point!.y);
  await expect(page.locator(RIVER)).toHaveAttribute("data-last-gimmick", "ripple");
  await expect(page.locator(RIVER)).toHaveAttribute("data-gimmick-count", "1");
  await expect(page.locator('[data-testid="flat-ripple"][visibility="visible"]').first()).toBeAttached();
});

test("krathong tap shows the anonymous popup", async ({ page }) => {
  await setUp(page);
  await page.goto("/");
  await walkToWorld(page);
  const hit = page.locator('[data-input-target="krathong"]').first();
  // Centred, so the item never sits under an overlay of the full-screen stage (MFW-54).
  await hit.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const box = (await hit.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByText(INSPECT_DIALOG_TITLE)).toBeVisible();
});

test("Find My scrolls to my krathong", async ({ page }) => {
  await setUp(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await walkToWorld(page);
  await page.locator(SCROLLER).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.getByRole("button", { name: FIND_MY_BUTTON }).click();
  const entries = page.locator('[data-testid="my-creations-list"] li > button');
  await expect(entries).toHaveCount(1);
  await entries.first().click();
  await expect(page.locator(RIVER)).toHaveAttribute("data-focused-creation-id", E2E_CREATION_ID);
  await expect
    .poll(() =>
      page.locator(SCROLLER).evaluate((el, probedHeightPx) => {
        const own = el.querySelector('[data-own="true"]');
        const ownX = Number(/translate\(([-\d.e]+) /.exec(own?.getAttribute("transform") ?? "")?.[1]);
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        const wanted = Math.min(max, Math.max(0, ownX - el.clientWidth / 2)); // the scroll clamps near an end
        // The map is as tall as the stage (MFW-54): measure the drift in px of the map height the tolerance was set at.
        const mapScale = Number(el.querySelector("svg")?.getAttribute("height")) / probedHeightPx;
        return Math.abs(el.scrollLeft - wanted) / mapScale;
      }, E2E_FLAT_RIVER_PROBED_HEIGHT_PX),
    )
    .toBeLessThanOrEqual(FIND_MY_TOLERANCE_PX);
  // MFW-67: the focused krathong is marked by a steady size-up, no ring.
  const own = page.locator('[data-testid="flat-river-item"][data-own="true"]');
  await expect(own).toHaveAttribute("data-marked", "true");
  await expect(own).toHaveAttribute("transform", /\bscale\(/);
  await expect(page.locator('[data-testid="flat-focus-ring"]')).toHaveCount(0);
});

test("FALLBACK_2D follows the day / night preset (MFW-51)", async ({ page }) => {
  const errors = await setUp(page);
  await page.addInitScript((key) => localStorage.setItem(key, "NIGHT"), E2E_LIGHT_PRESET_STORAGE_KEY);
  await page.goto("/");
  await waitForActiveEvent(page);
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-light-preset", "NIGHT");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator(RIVER)).toHaveAttribute("data-light-preset", "NIGHT");
  const bankFill = () => page.locator(`${RIVER} svg > rect`).first().getAttribute("fill");
  const nightFill = await bankFill();
  await page.getByRole("radiogroup", { name: "แสงในฉาก" }).getByRole("radio", { name: "กลางวัน" }).click();
  await expect(page.locator(RIVER)).toHaveAttribute("data-light-preset", "DAY");
  await expect.poll(bankFill).not.toBe(nightFill);
  expect(errors).toEqual([]);
});

test("FALLBACK_2D world shows the village (MFW-51)", async ({ page }) => {
  await setUp(page);
  await page.goto("/");
  await walkToWorld(page);
  for (const selector of [
    '[data-flat-prop="house"][data-roof="pyramid"]',
    '[data-flat-prop="house"][data-roof="gable"]',
    '[data-flat-prop="tree"][data-tree-shape="round"]',
    '[data-flat-prop="tree"][data-tree-shape="tall"]',
    '[data-flat-prop="lamp"]',
    '[data-flat-prop="reed"]',
  ]) {
    await expect.poll(() => page.locator(selector).count(), { message: selector }).toBeGreaterThan(0);
  }
  await expect(page.locator("canvas")).toHaveCount(0);
});
