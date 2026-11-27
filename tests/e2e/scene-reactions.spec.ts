import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { E2E_MAX_SHADER_PROGRAMS } from "./fixtures/perfAudit";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";
import {
  E2E_CHIMNEY_SMOKE_NAME,
  E2E_DRAG_START_DISTANCE_PX,
  E2E_FALLING_LEAVES_NAME,
  E2E_FIREWORK_NAME,
  E2E_LAMP_GROUND_LIGHT_NAME,
  E2E_PINNED_TIER_URL,
  E2E_SKY_LANTERN_NAME,
  E2E_WINDOW_GLOW_NAME,
  installSceneProbe,
  listRingAndHaloMeshes,
  locateStableTarget,
  readProgramCount,
  sceneObjectVisible,
  waitForCameraRest,
  waitForKrathongModels,
} from "./helpers/sceneProbe";
import { expectWorldAfterRelease } from "./helpers/release";

/**
 * MFW-60 (backlog 11.4): scene reactions on the production build (SwiftShader). A sky tap (bare land) launches a firework, a house
 * tap lights its windows, a drag fires nothing, no reaction adds a shader program and nothing draws a ring or a halo. Every target
 * is located through the scene probe (never a fixed screen point) and every check polls a DOM attribute.
 * MFW-72 (backlog 11.6): the house tap also puffs chimney smoke (no new program, no ring or halo); under reduced motion it does not.
 * MFW-75 (backlog 14.2): a sky tap launches a firework OR a sky lantern at random. The scene probe seeds the choice (SKY_LAUNCH_SEED),
 * so the first sky tap of a page is a firework and the second a sky lantern; a lamp tap lights the lamp (head + ground light).
 * MFW-84 (backlog 15.2): S1 (HIGH) and S3 (LOW) tap a house (chimney smoke) and a tree (falling leaves, drawn with the crown's lit
 * material); neither adds a shader program.
 */

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

const root = (page: Page) => page.locator("[data-flow-state]");
const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function openWorld(page: Page, memory: number, cores: number, startUrl: string) {
  await mockCreateCreation(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
  await installSceneProbe(page);
  await page.goto(startUrl);
  await waitForActiveEvent(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page);
  await waitForKrathongModels(page); // MFW-65: the design files are in before any program count is sampled
  return { pageErrors, consoleErrors };
}

const count = async (page: Page) => Number(await scene(page).getAttribute("data-gimmick-count"));

/** Drag distance: well past DRAG_START_DISTANCE_PX, and far enough to pan the village into the 360 × 640 frame. */
const PAN_DRAG_PX = 20 * E2E_DRAG_START_DISTANCE_PX;
const PAN_DRAG_STEPS = 8;

/** Taps on a located bare-land point that a walking villager may have reached in the meantime (its hop draws nothing). */
const SKY_TAP_ATTEMPTS = 3;

/**
 * A sky tap (bare land) that must launch `expected` (seeded: the first sky draw of a page is a firework, the second a sky lantern).
 * A walking villager can step onto the located point before the tap lands; that tap hops the villager and spends no sky draw, so
 * the helper locates the land again (at most SKY_TAP_ATTEMPTS taps; MFW-75 for the second tap, MFW-77 for the first). Every tap
 * adds exactly one to the gimmick count; any other result than `expected` or "villager-hop" fails. Returns the count after the launch.
 */
async function skyTapLaunches(page: Page, countBefore: number, expected: "firework" | "sky-lantern"): Promise<number> {
  let n = countBefore;
  for (let attempt = 0; attempt < SKY_TAP_ATTEMPTS; attempt++) {
    await waitForCameraRest(page);
    const sky = await locateStableTarget(page, "sky");
    await page.touchscreen.tap(sky.x, sky.y);
    n += 1;
    await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(n));
    const last = await scene(page).getAttribute("data-last-gimmick");
    if (last === "villager-hop") continue; // a walking villager took the tap; it spends no sky draw
    expect(last).toBe(expected); // seed 8: anything else is a regression
    return n;
  }
  throw new Error(`no ${expected} after ${SKY_TAP_ATTEMPTS} land taps`);
}

/** MFW-75: the second sky tap of the page (seeded) releases a sky lantern from the land point. Returns the count after it. */
async function secondSkyTapReleasesLantern(page: Page, countBefore: number): Promise<number> {
  const n = await skyTapLaunches(page, countBefore, "sky-lantern");
  await expect.poll(() => sceneObjectVisible(page, E2E_SKY_LANTERN_NAME)).toBe(true);
  return n;
}

/** MFW-75: a lamp tap lights the lamp (head glow and the ground light). */
async function lampTapLightsLamp(page: Page, expectedCount: number) {
  await waitForCameraRest(page);
  const lamp = await locateStableTarget(page, "lamp");
  await page.touchscreen.tap(lamp.x, lamp.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "lamp-glow");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(expectedCount));
  await expect.poll(() => sceneObjectVisible(page, E2E_LAMP_GROUND_LIGHT_NAME)).toBe(true);
}

/** MFW-72 / MFW-84: a house tap lights its windows and puffs chimney smoke. */
async function houseTapPuffsSmoke(page: Page, expectedCount: number) {
  await waitForCameraRest(page);
  const house = await locateStableTarget(page, "house");
  await page.touchscreen.tap(house.x, house.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(expectedCount));
  await expect.poll(() => sceneObjectVisible(page, E2E_WINDOW_GLOW_NAME)).toBe(true);
  await expect.poll(() => sceneObjectVisible(page, E2E_CHIMNEY_SMOKE_NAME)).toBe(true);
}

/** MFW-84: a tree tap shakes it and drops a few leaves. */
async function treeTapDropsLeaves(page: Page, expectedCount: number) {
  await waitForCameraRest(page);
  const tree = await locateStableTarget(page, "tree");
  await page.touchscreen.tap(tree.x, tree.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "tree-shake");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(expectedCount));
  await expect.poll(() => sceneObjectVisible(page, E2E_FALLING_LEAVES_NAME)).toBe(true);
}

/** A mouse drag that starts on bare land and pans the world down (the camera travels; MFW-57), then waits for the camera. */
async function dragFromLand(page: Page) {
  const from = await locateStableTarget(page, "sky");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + PAN_DRAG_PX, { steps: PAN_DRAG_STEPS });
  await page.mouse.up();
  await waitForCameraRest(page);
}

test("S1 HIGH: a sky tap launches a firework, a house tap lights its windows, a drag fires nothing", async ({ page }) => {
  test.slow(); // MFW-75: two sky taps, a drag, a house and a water tap, each after a camera rest (SwiftShader)
  const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "HIGH");
  await nextFrames(page);
  const programsBefore = await readProgramCount(page);
  const base = await count(page);

  const afterFirework = await skyTapLaunches(page, base, "firework"); // MFW-77: retries a villager-hop like the second tap
  await expect.poll(() => sceneObjectVisible(page, E2E_FIREWORK_NAME)).toBe(true); // drawn now (the mesh exists from mount)
  await expect(scene(page)).not.toHaveAttribute("data-selected-target", "lamp"); // a prop tap selects nothing
  const n = await secondSkyTapReleasesLantern(page, afterFirework); // MFW-75

  // A drag that starts on bare land pans the camera and fires no reaction (MFW-57 / MFW-59 tap-drag separation). It pans the
  // village (which sits under the top overlay at the pier framing on 360 × 640) into view.
  await dragFromLand(page);
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(n));

  // MFW-72: the smoke puff is drawn too; MFW-84: then a tree tap drops leaves. The program and ring / halo checks below cover both.
  await houseTapPuffsSmoke(page, n + 1);
  await treeTapDropsLeaves(page, n + 2);

  await waitForCameraRest(page);
  const water = await locateStableTarget(page, "water");
  await page.touchscreen.tap(water.x, water.y);
  await expect(scene(page)).toHaveAttribute("data-last-gimmick", "ripple");
  await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(n + 3)); // the drag added nothing

  await nextFrames(page);
  const programsAfter = await readProgramCount(page);
  expect(programsAfter).not.toBeNull();
  // The reactions reuse the ripple / lamp-glow program (MFW-75: the sky lantern too). (HIGH also compiles the shadow-map programs, so the absolute LOW-tier budget
  // E2E_MAX_SHADER_PROGRAMS is checked in S3.)
  expect(programsAfter).toBe(programsBefore);
  await expect.poll(() => listRingAndHaloMeshes(page)).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("S2 HIGH: a sky tap, a lamp tap and a house tap still react (static variants)", async ({ page }) => {
    test.slow(); // MFW-75: two sky taps, a lamp tap, a drag and a house tap, each after a camera rest (SwiftShader)
    const errors = await openWorld(page, 8, 8, E2E_PINNED_TIER_URL);
    await expect(root(page)).toHaveAttribute("data-reduced-motion", "true");
    const base = await count(page);
    const afterFirework = await skyTapLaunches(page, base, "firework"); // MFW-77: retries a villager-hop like the second tap
    const n = await secondSkyTapReleasesLantern(page, afterFirework); // MFW-75: the static lantern
    // MFW-66: the house tap comes before the lamp tap (the S1 path). After the lamp tap's camera move and the drag, the only house
    // left in the 360 × 640 frame sat about 0.5 px above the bottom card, so a lower roof top (the owner house model) hid it.
    await dragFromLand(page);
    const house = await locateStableTarget(page, "house");
    await page.touchscreen.tap(house.x, house.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
    await expect(scene(page)).toHaveAttribute("data-gimmick-count", String(n + 1));
    // MFW-72: the instant state is the window light-up; no smoke particles under reduced motion.
    await expect.poll(() => sceneObjectVisible(page, E2E_WINDOW_GLOW_NAME)).toBe(true);
    await nextFrames(page);
    expect(await sceneObjectVisible(page, E2E_CHIMNEY_SMOKE_NAME)).toBe(false);
    await lampTapLightsLamp(page, n + 2); // MFW-75: the light switches on instantly
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test.describe("LOW", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("S3 LOW: a sky tap launches the cheap firework, then a sky lantern; a lamp, a house and a tree tap react", async ({ page }) => {
    test.slow(); // MFW-84: a drag, a house and a tree tap more, each after a camera rest (SwiftShader)
    const errors = await openWorld(page, 2, 2, "/");
    await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
    await nextFrames(page);
    const programsBefore = await readProgramCount(page);
    const base = await count(page);
    const afterFirework = await skyTapLaunches(page, base, "firework"); // MFW-77: retries a villager-hop like the second tap
    const n = await secondSkyTapReleasesLantern(page, afterFirework); // MFW-75
    await lampTapLightsLamp(page, n + 1); // MFW-75
    await dragFromLand(page); // MFW-84: pans the village into the frame (as S1)
    await houseTapPuffsSmoke(page, n + 2);
    await treeTapDropsLeaves(page, n + 3);
    await nextFrames(page);
    const programsAfter = await readProgramCount(page);
    // The firework, the lantern, the lamp light, the smoke and the leaves (the crown's program) add no shader program.
    expect(programsAfter).toBe(programsBefore);
    expect(programsAfter!).toBeLessThanOrEqual(E2E_MAX_SHADER_PROGRAMS);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
