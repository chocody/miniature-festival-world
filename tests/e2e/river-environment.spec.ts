import { expect, test, type Page } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { completeWishStep } from "./helpers/wishStep";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_MAX_SHADER_PROGRAMS } from "./fixtures/perfAudit";
import { E2E_PINNED_TIER_URL, installSceneProbe, readProgramCount, readWaterNormals } from "./helpers/sceneProbe";

test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT }); // MFW-54: see E2E_SWIFTSHADER_3D_VIEWPORT

const root = (page: Page) => page.locator("[data-flow-state]");
const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** MFW-79: a normal y below 1 − this is a tilted (shaded) swell. */
const FLAT_NORMAL_EPSILON = 1e-4;
/** MFW-79: SwiftShader renders slowly; the HIGH swells must be rewritten within this time. */
const WAVE_POLL_TIMEOUT_MS = 10_000;

const TIERS = [
  { tier: "HIGH", deviceMemory: 8, hardwareConcurrency: 8 },
  { tier: "LOW", deviceMemory: 2, hardwareConcurrency: 2 },
] as const;

for (const { tier, deviceMemory, hardwareConcurrency } of TIERS) {
  test(`${tier} tier: the river environment renders in every canvas mode without errors`, async ({ page }) => {
    await mockCreateCreation(page);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.addInitScript(
      ({ memory, cores }) => {
        Object.defineProperty(navigator, "deviceMemory", { get: () => memory, configurable: true });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => cores, configurable: true });
      },
      { memory: deviceMemory, cores: hardwareConcurrency },
    );
    await installSceneProbe(page);
    // HIGH is pinned so it cannot step down mid-test on a slow SwiftShader runner; LOW has no step-down.
    await page.goto(tier === "HIGH" ? E2E_PINNED_TIER_URL : "/");
    await expect(root(page)).toHaveAttribute("data-quality-tier", tier);

    await waitForActiveEvent(page);
    await expect(page.locator("canvas")).toHaveCount(1);

    await page.getByRole("button", { name: "ถัดไป" }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "WRITE_WISH");
    await completeWishStep(page);
    await expect(root(page)).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
    await expect(page.locator("canvas")).toHaveCount(1);

    await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
    await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
    await expect(page.locator("canvas")).toHaveCount(1);
    await nextFrames(page);

    // MFW-79: the water shows swells on every tier; they drift on HIGH (W1) and stay still on LOW, with no new program (W2).
    const first = await readWaterNormals(page);
    expect(first).not.toBeNull();
    expect(first!.minNormalY).toBeLessThan(1 - FLAT_NORMAL_EPSILON);
    if (tier === "HIGH") {
      await expect
        .poll(async () => (await readWaterNormals(page))?.version ?? -1, { timeout: WAVE_POLL_TIMEOUT_MS })
        .toBeGreaterThan(first!.version);
    } else {
      await nextFrames(page);
      await nextFrames(page);
      await nextFrames(page);
      expect((await readWaterNormals(page))!.version).toBe(first!.version);
      const programs = await readProgramCount(page);
      expect(programs).not.toBeNull();
      expect(programs!).toBeLessThanOrEqual(E2E_MAX_SHADER_PROGRAMS);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
