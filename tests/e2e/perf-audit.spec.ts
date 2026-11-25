import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { completeWishStep } from "./helpers/wishStep";
import {
  E2E_MAX_HEAP_GROWTH_BYTES,
  E2E_PERF_PROBE_GLOBAL,
  E2E_PERF_PROBE_QUERY,
  E2E_PERF_TEST_TIMEOUT_MS,
  E2E_SOAK_DWELL_MS,
  E2E_SOAK_MARGIN_MS,
  E2E_SOAK_SWITCHES,
  E2E_SOAK_ZONE_COUNT,
  E2E_ZONE_SWITCH_CYCLES,
  PERF_AUDIT_RECORD_ONLY_ENV,
} from "./fixtures/perfAudit";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_EVENT_ID, makeZoneBody } from "./fixtures/zoneFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL } from "./helpers/sceneProbe";

/** Phone-sized viewport: far fewer pixels for SwiftShader, so these long renders do not starve the other 3D tests running in parallel. */
const PHONE_VIEWPORT = { width: 360, height: 800 };
test.use({ hasTouch: true, viewport: PHONE_VIEWPORT });

/** Manual one-off for the "before" numbers (per-mesh RiverFlow): expectations on numbers, tier and errors are skipped. */
const RECORD_ONLY = process.env[PERF_AUDIT_RECORD_ONLY_ENV] === "1";

const NAV = '[data-testid="zone-navigator"]';
const VIEWPORT = '[aria-label="Toy-like night river preview"]';
const PROBE = '[data-testid="perf-probe"]';
const root = (page: Page) => page.locator("[data-flow-state]");

interface ProbeSample {
  geometries: number;
  textures: number;
  programs: number;
  calls: number;
  triangles: number;
  frame: number;
  riverItems: number;
  jsHeapBytes: number | null;
}

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

/**
 * The two long LOW-tier tests render flat out for tens of seconds; on a shared 4-core runner that starves the other specs'
 * HIGH-tier tests (their FPS step-down is 45 FPS). This caps animation frames at a steady cadence (no delay is added to a frame
 * that already took longer). 30 ms admits every 2nd tick of a 60 Hz rAF (~30 FPS), well above the 20 FPS fallback threshold —
 * a gap above 33.3 ms would admit only every 3rd tick (20 FPS, exactly the threshold). Counters (draw calls, geometries, programs,
 * heap) do not depend on the frame rate.
 */
const FRAME_PACING_GAP_MS = 30;
async function paceFrames(page: Page) {
  await page.addInitScript((gap) => {
    const raf = window.requestAnimationFrame.bind(window);
    let admitted = Number.NEGATIVE_INFINITY;
    let nextId = 1;
    const cancelled = new Set<number>(); // ids cancelled before their callback ran: no ghost frame
    const request = (callback: FrameRequestCallback, id: number): void => {
      raf((t) => {
        if (cancelled.delete(id)) return;
        if (t === admitted || t - admitted >= gap) {
          admitted = t;
          callback(t);
        } else {
          request(callback, id);
        }
      });
    };
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      request(callback, id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      cancelled.add(id);
    };
  }, FRAME_PACING_GAP_MS);
}

async function routeZones(page: Page, zoneCount: number, sizes: Record<number, number>) {
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount } }),
  );
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) => {
      const zone = Number(new URL(route.request().url()).searchParams.get("zone") ?? "");
      return route.fulfill({ json: makeZoneBody(zone, sizes[zone] ?? 0) });
    },
  );
}

/** `?pinTier=1` as an extra query parameter (the probe query comes first). */
const PIN_TIER_PARAM = E2E_PINNED_TIER_URL.slice(E2E_PINNED_TIER_URL.indexOf("?") + 1);

async function walkToWorld(page: Page, pinned = false) {
  await page.goto("/" + E2E_PERF_PROBE_QUERY + (pinned ? `&${PIN_TIER_PARAM}` : ""));
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(PROBE)).toBeVisible();
}

async function goToZone(page: Page, target: number, expectedItems: number) {
  const nav = page.locator(NAV);
  for (let guard = 0; guard < 10; guard++) {
    const current = Number(await nav.getAttribute("data-zone-id"));
    if (current === target) break;
    const name = current > target ? /คุ้งน้ำก่อนหน้า/ : /คุ้งน้ำถัดไป/;
    await page.getByRole("button", { name }).click();
    await expect(nav).not.toHaveAttribute("data-zone-id", String(current));
  }
  await expect(nav).toHaveAttribute("data-zone-id", String(target));
  await expect(nav).toHaveAttribute("data-zone-status", "ready");
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-river-item-count", String(expectedItems));
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

/** After a release the camera flies to the pier; wait until the draw-call count stops changing so the soak starts from a still scene. */
async function settleCamera(page: Page) {
  let previous = -1;
  for (let i = 0; i < 20; i++) {
    const { calls } = await sample(page);
    if (calls === previous) return;
    previous = calls;
    await page.waitForTimeout(500);
  }
}

async function heapAfterGc(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize;
}

function report(testInfo: TestInfo, data: unknown) {
  console.log("[perf-audit] " + testInfo.title + " " + JSON.stringify(data));
  return testInfo.attach("perf-audit.json", { body: JSON.stringify(data, null, 2), contentType: "application/json" });
}

test("HIGH: draw calls do not grow with the number of river krathongs", async ({ page }, testInfo) => {
  test.setTimeout(E2E_PERF_TEST_TIMEOUT_MS);
  const errors = collectErrors(page);
  await forceTier(page, 8, 8);
  await routeZones(page, 3, { 1: 1, 2: 80 });
  await mockCreateCreation(page, { zoneId: 3 }); // the release lands in the empty zone 3, which the audit never measures
  await walkToWorld(page, true); // pinned: the forced 3D tier cannot fall back to 2D mid-audit on a slow SwiftShader runner
  const tierNow = () => root(page).getAttribute("data-quality-tier");
  // The FPS step-down may fire mid-run on a loaded runner (owner thresholds, never raised). Both samples must share one tier, so
  // retake the pair until the tier is stable around them; the check holds at whatever tier both samples share.
  let pair: { tier: string | null; full: ProbeSample; one: ProbeSample } | null = null;
  for (let attempt = 0; attempt < 3 && pair === null; attempt++) {
    await goToZone(page, 2, 80);
    const t0 = await tierNow();
    const full = await sample(page);
    const t1 = await tierNow();
    await goToZone(page, 1, 1);
    const t2 = await tierNow();
    const one = await sample(page);
    const t3 = await tierNow();
    if (t0 === t1 && t1 === t2 && t2 === t3) pair = { tier: t0, full, one };
  }
  if (pair === null) throw new Error("tier kept changing between the samples (SwiftShader too slow); report it, do not raise thresholds");
  const { tier, full, one } = pair;
  await report(testInfo, {
    tier,
    callsOne: one.calls,
    callsFull: full.calls,
    trianglesOne: one.triangles,
    trianglesFull: full.triangles,
  });
  if (RECORD_ONLY) return;
  expect(tier).not.toBe("FALLBACK_2D");
  expect(full.calls).toBe(one.calls);
  expect(full.triangles).toBeGreaterThan(one.triangles);
  expect(errors).toEqual([]);
});

test("LOW: memory stays flat across repeated zone switches", async ({ page }, testInfo) => {
  test.setTimeout(E2E_PERF_TEST_TIMEOUT_MS);
  const errors = collectErrors(page);
  await forceTier(page, 2, 2);
  await paceFrames(page);
  await routeZones(page, 4, { 1: 1, 2: 80, 3: 80 });
  await mockCreateCreation(page, { zoneId: 4 }); // the release lands in the empty zone 4, which the audit never measures
  await walkToWorld(page);
  const cdp = await page.context().newCDPSession(page);

  await goToZone(page, 3, 80);
  await goToZone(page, 2, 80);
  await goToZone(page, 1, 1);
  const one = await sample(page);
  await goToZone(page, 2, 80);
  await goToZone(page, 3, 80);
  const base = await sample(page);
  const heap0 = await heapAfterGc(cdp);

  for (let cycle = 0; cycle < E2E_ZONE_SWITCH_CYCLES; cycle++) {
    await goToZone(page, 2, 80);
    await goToZone(page, 1, 1);
    await goToZone(page, 2, 80);
    await goToZone(page, 3, 80);
  }
  const end = await sample(page);
  const heap1 = await heapAfterGc(cdp);
  const tier = await root(page).getAttribute("data-quality-tier");
  await report(testInfo, {
    tier,
    switches: 4 * E2E_ZONE_SWITCH_CYCLES,
    callsOne: one.calls,
    callsBase: base.calls,
    callsEnd: end.calls,
    geometries: [base.geometries, end.geometries],
    textures: [base.textures, end.textures],
    programs: [base.programs, end.programs],
    heapBytes: [heap0, heap1],
    heapGrowthBytes: heap1 - heap0,
  });
  if (RECORD_ONLY) return;
  expect(end.geometries).toBe(base.geometries);
  expect(end.textures).toBe(base.textures);
  expect(end.programs).toBe(base.programs);
  expect(end.calls).toBe(base.calls);
  expect(base.calls).toBe(one.calls);
  expect(heap1 - heap0).toBeLessThanOrEqual(E2E_MAX_HEAP_GROWTH_BYTES);
  expect(tier).not.toBe("FALLBACK_2D"); // LOW has no step-down; the counters above are only valid on a 3D tier
  expect(errors).toEqual([]);
});

test("probe soak completes with flat counters", async ({ page }, testInfo) => {
  test.setTimeout(E2E_PERF_TEST_TIMEOUT_MS);
  const errors = collectErrors(page);
  await forceTier(page, 2, 2);
  await paceFrames(page);
  await routeZones(page, 2, { 1: 0, 2: 0 }); // the in-memory API is shared by every spec; pin the zones to empty
  await mockCreateCreation(page, { zoneId: 2 }); // the release lands in zone 2; the soak runs in zone 1, without the own krathong
  await walkToWorld(page);
  await goToZone(page, 1, 0);
  await settleCamera(page);
  await page.getByRole("button", { name: "Run zone-switch soak" }).click();
  const probe = page.locator(PROBE);
  await expect(probe).toHaveAttribute("data-soak-status", "done", {
    timeout: (E2E_SOAK_ZONE_COUNT + E2E_SOAK_SWITCHES) * E2E_SOAK_DWELL_MS + E2E_SOAK_MARGIN_MS,
  });
  const result = JSON.parse((await probe.getAttribute("data-soak-result")) ?? "null") as {
    delta: { geometries: number; textures: number; programs: number; calls: number } | null;
  };
  await report(testInfo, result);
  if (RECORD_ONLY) return;
  expect(result.delta).not.toBeNull();
  expect(result.delta?.geometries).toBe(0);
  expect(result.delta?.textures).toBe(0);
  expect(result.delta?.programs).toBe(0);
  expect(result.delta?.calls).toBe(0);
  await expect(page.locator(VIEWPORT)).toHaveAttribute("data-river-item-count", "0");
  expect(errors).toEqual([]);
});
