import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { walkToWorld } from "./helpers/ownKrathongPopup";
import {
  E2E_DRAG_START_DISTANCE_PX,
  E2E_PINNED_TIER_URL,
  installSceneProbe,
  locateSceneTargets,
  locateStableTarget,
  waitForCameraRest,
  waitForKrathongModels,
  type ScreenPoint,
} from "./helpers/sceneProbe";

/**
 * MFW-84 X84: before / after screenshots of the house-tap chimney smoke and the tree-tap falling leaves at phone size (DAY and
 * NIGHT, HIGH). Opt-in (`MFW_SCREENSHOTS=1`); `MFW_SCREENSHOT_PHASE` names the files ("before" | "after"). The only assertions are
 * the gimmick attributes. `MFW_SCREENSHOT_TIER=LOW` is a review-only variant (files get a `-low` suffix; not committed).
 */
const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // duplicated literal (look.config.ts)
const SMOKE_SHOT_MS = 1_200;
const LEAF_SHOT_MS = 900;
const PAN_DRAG_PX = 20 * E2E_DRAG_START_DISTANCE_PX; // as scene-reactions.spec.ts: pans the village into view
const PAN_DRAG_STEPS = 8;

const phase = process.env.MFW_SCREENSHOT_PHASE === "before" ? "before" : "after";
const low = process.env.MFW_SCREENSHOT_TIER === "LOW";

test.skip(process.env.MFW_SCREENSHOTS !== "1", "screenshot run only");
test.use({ timezoneId: "Asia/Bangkok", hasTouch: true, viewport: { width: 390, height: 844 } });

const scene = (page: Page) => page.locator('[aria-label="Toy-like night river preview"]');

/** Finds a house / tree tap target at the resting framing; if there is none, pans once from bare land (as S1 does). */
async function locateOrPan(page: Page, key: "house" | "tree"): Promise<ScreenPoint> {
  await waitForCameraRest(page);
  if (!(await locateSceneTargets(page))[key]) {
    const from = await locateStableTarget(page, "sky");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + PAN_DRAG_PX, { steps: PAN_DRAG_STEPS });
    await page.mouse.up();
    await waitForCameraRest(page);
  }
  return locateStableTarget(page, key);
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const preset of ["DAY", "NIGHT"] as const) {
  test(`X84 ${preset} house smoke and tree leaves`, async ({ page }, testInfo) => {
    test.slow(); // SwiftShader: two taps after camera rests
    const tier = low ? { m: 2, c: 2 } : { m: 8, c: 8 };
    await page.addInitScript(
      ([key, value, m, c]) => {
        localStorage.setItem(key as string, value as string);
        Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
      },
      [LIGHT_PRESET_STORAGE_KEY, preset, tier.m, tier.c] as const,
    );
    await installSceneProbe(page);
    await mockCreateCreation(page);
    await page.goto(low ? "/" : E2E_PINNED_TIER_URL);
    await walkToWorld(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    await waitForCameraRest(page);
    await waitForKrathongModels(page);
    const suffix = `${preset.toLowerCase()}${low ? "-low" : ""}`;

    const house = await locateOrPan(page, "house");
    await page.touchscreen.tap(house.x, house.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "house-lights");
    await page.waitForTimeout(SMOKE_SHOT_MS);
    await shoot(page, testInfo, `${phase}-house-smoke-${suffix}`);

    const tree = await locateOrPan(page, "tree");
    await page.touchscreen.tap(tree.x, tree.y);
    await expect(scene(page)).toHaveAttribute("data-last-gimmick", "tree-shake");
    await page.waitForTimeout(LEAF_SHOT_MS);
    await shoot(page, testInfo, `${phase}-tree-leaves-${suffix}`);
  });
}
