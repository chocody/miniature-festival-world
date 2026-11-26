import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { mockCreateCreation, E2E_CREATION_ID } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { makeOwnZoneItem } from "./fixtures/findMyFixtures";
import {
  E2E_LIGHT_PRESET_STORAGE_KEY,
  E2E_SCENE_BACKGROUNDS,
  E2E_SWIFTSHADER_3D_VIEWPORT,
  coverageSamplePoints,
  isBackgroundPixel,
} from "./fixtures/stageFixtures";
import {
  E2E_MAX_HEAP_GROWTH_BYTES,
  E2E_MAX_SHADER_PROGRAMS,
  E2E_PERF_PROBE_GLOBAL,
  E2E_PERF_PROBE_QUERY,
  E2E_PERF_TEST_TIMEOUT_MS,
  E2E_SOAK_DWELL_MS,
} from "./fixtures/perfAudit";
import {
  E2E_MAX_TRAVEL_DRAGS,
  E2E_NEXT_ZONE_NAME,
  E2E_PREVIOUS_ZONE_NAME,
  E2E_TRAVEL_DRAG_FRACTION,
  E2E_TRAVEL_JUMPS,
  E2E_ZONE_LABEL,
  E2E_TRAVEL_TEST_TIMEOUT_MS,
} from "./fixtures/endlessRiver";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { readStagePixels } from "./helpers/backgroundProbe";
import { E2E_PINNED_TIER_URL, installSceneProbe, locateStableTarget, waitForCameraRest } from "./helpers/sceneProbe";
import { completeWishStep } from "./helpers/wishStep";

/**
 * MFW-58 (backlog 11.2): the endless river on the production build (SwiftShader). Travelling along the river never reaches an edge,
 * zones stream in around the camera and wrap (after the last zone comes zone 1; one zone repeats), the navigator shows the zone
 * under the camera and jumps one stretch, Find My works after travel, memory stays flat over many jumps, and the MFW-60 reactions
 * work in a non-zero stretch. 3D specs open the pinned-tier URL, HIGH specs use the 360 × 640 viewport, jumps use reduced motion
 * (instant cuts), and every check polls a DOM attribute — never a fixed screen point after a flight.
 */

const NAV = '[data-testid="zone-navigator"]';
const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function forceTier(page: Page, memory: number, cores: number) {
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
}

/** Both zone endpoints from fixtures; returns the zone ids requested from /api/creations, in order. */
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
      if (route.request().method() !== "GET") return route.fallback();
      const zone = Number(new URL(route.request().url()).searchParams.get("zone") ?? "");
      requested.push(String(zone));
      const body = makeZoneBody(zone, sizes[zone] ?? 0);
      if (own && own.zoneId === zone) body.items.push(makeOwnZoneItem(zone, own.id, Date.now()));
      return route.fulfill({ json: body });
    },
  );
  return requested;
}

async function walkToWorld(page: Page, url: string) {
  await page.goto(url);
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
}

/** HIGH, pinned, DAY (the NIGHT clear colour is close to the moonlit ground; MFW-68), 360 × 640. */
async function openHighWorld(page: Page, zoneCount: number, sizes: Record<number, number>, releaseZone: number, own?: { zoneId: number; id: string }) {
  const errors = collectErrors(page);
  await page.setViewportSize(E2E_SWIFTSHADER_3D_VIEWPORT);
  await forceTier(page, 8, 8);
  await page.addInitScript((key) => localStorage.setItem(key, "DAY"), E2E_LIGHT_PRESET_STORAGE_KEY);
  await installSceneProbe(page);
  const requested = await routeZones(page, zoneCount, sizes, own);
  await mockCreateCreation(page, { zoneId: releaseZone }); // after the zone routes: handles POST only
  await walkToWorld(page, E2E_PINNED_TIER_URL);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await waitForCameraRest(page);
  return { errors, requested };
}

/** Mouse drags along the river (finger to the left = the camera travels downstream) until the stretch index changes. */
async function travelDownstream(page: Page, fromStretch: number) {
  const vp = page.viewportSize()!;
  for (let i = 0; i < E2E_MAX_TRAVEL_DRAGS; i++) {
    if ((await scene(page).getAttribute("data-stretch-index")) !== String(fromStretch)) return;
    const start = await locateStableTarget(page, "water");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - E2E_TRAVEL_DRAG_FRACTION * vp.width, start.y, { steps: 6 });
    await page.mouse.up();
    await waitForCameraRest(page);
  }
}

async function expectNoBackground(page: Page, step: string) {
  const preset = (await scene(page).getAttribute("data-light-preset")) as keyof typeof E2E_SCENE_BACKGROUNDS;
  const vp = page.viewportSize()!;
  for (const { name, rgb } of await readStagePixels(page, coverageSamplePoints(vp.width, vp.height))) {
    expect(isBackgroundPixel(rgb, E2E_SCENE_BACKGROUNDS[preset]), `${step} ${name} rgb(${rgb})`).toBe(false);
  }
}

test("E1 HIGH: dragging along the river passes the seam; zones stream in and wrap after the last one", async ({ page }) => {
  test.setTimeout(E2E_TRAVEL_TEST_TIMEOUT_MS);
  const { errors } = await openHighWorld(page, 3, { 1: 2, 2: 2, 3: 3 }, 3);
  const nav = page.locator(NAV);
  await expect(scene(page)).toHaveAttribute("data-stretch-index", "0");
  await expect(scene(page)).toHaveAttribute("data-zone-id", "3");
  await expect(scene(page)).toHaveAttribute("data-streamed-zone-ids", "3,2,1");
  await travelDownstream(page, 0);
  await expect(scene(page)).toHaveAttribute("data-stretch-index", "1");
  await expect(scene(page)).toHaveAttribute("data-zone-id", "1"); // after the last zone comes zone 1 (open question 37)
  await expect(nav).toContainText(E2E_ZONE_LABEL(1, 3));
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(scene(page)).toHaveAttribute("data-river-item-count", "2");
  await waitForCameraRest(page);
  await expectNoBackground(page, "after the seam");
  expect(errors).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("E2 HIGH: the navigator jumps one stretch with an instant cut; prev twice wraps to zone 2", async ({ page }) => {
    const { errors } = await openHighWorld(page, 3, { 1: 2, 2: 2, 3: 3 }, 3);
    const nav = page.locator(NAV);
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "0");
    await page.getByRole("button", { name: E2E_NEXT_ZONE_NAME }).click();
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "1");
    await expect(scene(page)).toHaveAttribute("data-zone-id", "1");
    await expect(nav).toContainText(E2E_ZONE_LABEL(1, 3));
    await page.getByRole("button", { name: E2E_PREVIOUS_ZONE_NAME }).click();
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "0");
    await page.getByRole("button", { name: E2E_PREVIOUS_ZONE_NAME }).click();
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "-1");
    await expect(scene(page)).toHaveAttribute("data-zone-id", "2");
    await expect(nav).toHaveAttribute("data-stretch-index", "-1");
    await expect(nav).toContainText(E2E_ZONE_LABEL(2, 3));
    expect(errors).toEqual([]);
  });

  test("E3 HIGH: with one zone there are no ‹ › buttons and the same zone comes back in every stretch", async ({ page }) => {
    test.setTimeout(E2E_TRAVEL_TEST_TIMEOUT_MS);
    const { errors } = await openHighWorld(page, 1, { 1: 3 }, 1);
    await expect(page.getByRole("button", { name: E2E_NEXT_ZONE_NAME })).toHaveCount(0);
    await expect(page.getByRole("button", { name: E2E_PREVIOUS_ZONE_NAME })).toHaveCount(0);
    await expect(scene(page)).toHaveAttribute("data-streamed-zone-ids", "1,1,1");
    await travelDownstream(page, 0);
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "1");
    await expect(scene(page)).toHaveAttribute("data-zone-id", "1");
    await expect(scene(page)).toHaveAttribute("data-streamed-zone-ids", "1,1,1");
    await expect(scene(page)).toHaveAttribute("data-river-item-count", "3");
    expect(errors).toEqual([]);
  });

  test("E5 HIGH: Find My after travelling two stretches shows my zone in the current stretch", async ({ page }) => {
    const { errors, requested } = await openHighWorld(page, 3, { 1: 2, 2: 2, 3: 3 }, 2, { zoneId: 2, id: E2E_CREATION_ID });
    await expect(scene(page)).toHaveAttribute("data-zone-id", "2"); // the release re-anchored stretch 0 to zone 2
    for (const s of ["1", "2"]) {
      await page.getByRole("button", { name: E2E_NEXT_ZONE_NAME }).click();
      await expect(scene(page)).toHaveAttribute("data-stretch-index", s);
    }
    await expect(scene(page)).toHaveAttribute("data-zone-id", "1");
    const before = requested.length;
    await page.getByRole("button", { name: "ค้นหาของฉัน" }).click();
    await page.locator('[data-testid="my-creations-list"] li > button').first().click();
    await expect(scene(page)).toHaveAttribute("data-zone-id", "2");
    await expect(scene(page)).toHaveAttribute("data-find-my", "following");
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "2");
    expect(requested.slice(before)).toContain("2");
    expect(errors).toEqual([]);
  });
});

test.describe("reduced motion, touch", () => {
  test.use({ reducedMotion: "reduce", hasTouch: true });

  test("E6 HIGH: in stretch 1 a sky tap launches a firework and a house tap lights its windows", async ({ page }) => {
    const { errors } = await openHighWorld(page, 2, { 1: 0, 2: 0 }, 1);
    await page.getByRole("button", { name: E2E_NEXT_ZONE_NAME }).click();
    await expect(scene(page)).toHaveAttribute("data-stretch-index", "1");
    await waitForCameraRest(page);
    await nextFrames(page);
    const sky = await locateStableTarget(page, "sky");
    await page.touchscreen.tap(sky.x, sky.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "firework");
    // Pan the village into view (a vertical drag from bare land; it stays in stretch 1), as scene-reactions.spec.ts does.
    const from = await locateStableTarget(page, "sky");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 160, { steps: 8 });
    await page.mouse.up();
    await waitForCameraRest(page);
    const house = await locateStableTarget(page, "house");
    await page.touchscreen.tap(house.x, house.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
    await expect(scene(page)).not.toHaveAttribute("data-stretch-index", "0");
    expect(errors).toEqual([]);
  });
});

interface ProbeSample {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
}

async function sample(page: Page): Promise<ProbeSample> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))),
  );
  const value = await page.evaluate(
    (name) => (window as unknown as Record<string, { sample(): unknown } | undefined>)[name]?.sample() ?? null,
    E2E_PERF_PROBE_GLOBAL,
  );
  expect(value).not.toBeNull();
  return value as ProbeSample;
}

async function heapAfterGc(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize;
}

/** In-page rAF gap sampler (the hitch metric, recorded for docs/perf/MFW-58.md, not asserted: SwiftShader runs at 12–15 FPS). */
async function startGapSampler(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __mfwGap?: { max: number; last: number } };
    const state = { max: 0, last: performance.now() };
    w.__mfwGap = state;
    const tick = (t: number) => {
      state.max = Math.max(state.max, t - state.last);
      state.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const readMaxGap = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mfwGap?: { max: number } }).__mfwGap?.max ?? null);

function report(testInfo: TestInfo, data: unknown) {
  console.log("[endless-river] " + testInfo.title + " " + JSON.stringify(data));
  return testInfo.attach("endless-river.json", { body: JSON.stringify(data, null, 2), contentType: "application/json" });
}

for (const tier of ["LOW", "HIGH"] as const) {
  test.describe(`E4 ${tier}`, () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 360, height: 640 } });

    test(`E4 ${tier}: memory stays flat over ${E2E_TRAVEL_JUMPS} stretch jumps; no geometry, texture or program is added`, async ({ page }, testInfo) => {
      test.setTimeout(E2E_PERF_TEST_TIMEOUT_MS);
      const errors = collectErrors(page);
      if (tier === "LOW") await forceTier(page, 2, 2);
      else await forceTier(page, 8, 8);
      await routeZones(page, 3, { 1: 80, 2: 80, 3: 80 });
      await mockCreateCreation(page, { zoneId: 3 });
      await walkToWorld(page, `/${E2E_PERF_PROBE_QUERY}&${E2E_PINNED_TIER_URL.slice(E2E_PINNED_TIER_URL.indexOf("?") + 1)}`);
      await expect(root(page)).toHaveAttribute("data-quality-tier", tier);
      const cdp = await page.context().newCDPSession(page);
      const jump = async (name: string) => {
        const s = Number(await scene(page).getAttribute("data-stretch-index"));
        await page.getByRole("button", { name }).click();
        await expect(scene(page)).not.toHaveAttribute("data-stretch-index", String(s));
        await expect(page.locator(NAV)).toHaveAttribute("data-zone-status", "ready");
        await page.waitForTimeout(E2E_SOAK_DWELL_MS);
      };
      // Warm-up: every slot has shown every zone once.
      for (let i = 0; i < 3; i++) await jump(E2E_NEXT_ZONE_NAME);
      for (let i = 0; i < 3; i++) await jump(E2E_PREVIOUS_ZONE_NAME);
      const base = await sample(page);
      const heap0 = await heapAfterGc(cdp);
      await startGapSampler(page);
      for (let i = 0; i < E2E_TRAVEL_JUMPS; i++) await jump(i % 4 < 2 ? E2E_NEXT_ZONE_NAME : E2E_PREVIOUS_ZONE_NAME);
      const maxGapMs = await readMaxGap(page);
      const end = await sample(page);
      const heap1 = await heapAfterGc(cdp);
      const tierNow = await root(page).getAttribute("data-quality-tier");
      await report(testInfo, {
        tier: tierNow,
        jumps: E2E_TRAVEL_JUMPS,
        calls: [base.calls, end.calls],
        triangles: [base.triangles, end.triangles],
        geometries: [base.geometries, end.geometries],
        textures: [base.textures, end.textures],
        programs: [base.programs, end.programs],
        heapBytes: [heap0, heap1],
        heapGrowthBytes: heap1 - heap0,
        maxFrameGapMs: maxGapMs,
        streamedZoneIds: await scene(page).getAttribute("data-streamed-zone-ids"),
      });
      expect(end.geometries).toBe(base.geometries);
      expect(end.textures).toBe(base.textures);
      expect(end.programs).toBe(base.programs);
      if (tier === "LOW") expect(end.programs).toBeLessThanOrEqual(E2E_MAX_SHADER_PROGRAMS);
      expect(heap1 - heap0).toBeLessThanOrEqual(E2E_MAX_HEAP_GROWTH_BYTES);
      expect(tierNow).not.toBe("FALLBACK_2D");
      expect(errors).toEqual([]);
    });
  });
}
