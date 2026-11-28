import { expect, test, type Page } from "@playwright/test";
import { openCustomizer } from "./helpers/activeEvent";
import { E2E_PINNED_TIER_URL, installSceneProbe } from "./helpers/sceneProbe";
import { E2E_SWIFTSHADER_3D_VIEWPORT } from "./fixtures/stageFixtures";
import { E2E_LIVING_WORLD as L } from "./fixtures/livingWorld";

/*
 * MFW-50 (backlog 9.4): villagers and ambient life on the production build (SwiftShader). CUSTOMIZE is enough: the riverside is in
 * the scene and the flame-flicker cadence draws frames (the living world adds no idle redraw outside the shared world view). No HIGH case (HIGH counts are unit-tested; HIGH e2e is the CI hazard).
 */
test.use({ hasTouch: true, viewport: E2E_SWIFTSHADER_3D_VIEWPORT });

const root = (page: Page) => page.locator("[data-flow-state]");

interface InstanceRead {
  readonly count: number;
  readonly translations: readonly number[];
}

/** count and per-instance translations (matrix elements 12–14) of the named InstancedMesh, or null when absent. */
function readInstances(page: Page, name: string): Promise<InstanceRead | null> {
  return page.evaluate((n) => {
    type Obj = { name: string; count?: number; instanceMatrix?: { array: ArrayLike<number> } };
    const scene = (window as unknown as { __mfwProbe?: { scene: { traverse(f: (o: Obj) => void): void } | null } }).__mfwProbe?.scene;
    if (!scene) return null;
    let found: Obj | null = null;
    // MFW-58: every stretch copy has its own villagers / motes; the first match is the camera's stretch (rendered first). Copies
    // outside the view are culled and skip their writes, so a later match would read a still mesh.
    scene.traverse((o) => {
      if (found === null && o.name === n && o.instanceMatrix) found = o;
    });
    const mesh = found as Obj | null;
    if (!mesh || !mesh.instanceMatrix) return null;
    const count = mesh.count ?? 0;
    const translations: number[] = [];
    for (let i = 0; i < count; i++) for (let k = 12; k < 15; k++) translations.push(mesh.instanceMatrix.array[i * 16 + k]);
    return { count, translations };
  }, name);
}

/** Names of living-world objects that R3F would raycast for pointer events (must be none). */
function livingInInteraction(page: Page): Promise<string[] | null> {
  return page.evaluate((prefixes) => {
    type Obj = { name: string; __r3f?: { root: { getState(): { internal: { interaction: { name: string }[] } } } } };
    const scene = (window as unknown as { __mfwProbe?: { scene: { traverse(f: (o: Obj) => void): void } | null } }).__mfwProbe?.scene;
    if (!scene) return null;
    let water: Obj | null = null;
    scene.traverse((o) => {
      if (o.name === "scene-water") water = o;
    });
    const state = (water as Obj | null)?.__r3f?.root.getState();
    if (!state) return null;
    return state.internal.interaction.map((o) => o.name).filter((name) => prefixes.some((p) => name.startsWith(p)));
  }, L.livingPrefixes as readonly string[]);
}

const maxDelta = (a: readonly number[], b: readonly number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

async function open(page: Page, memory: number, cores: number) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installSceneProbe(page);
  await page.addInitScript(
    ({ m, c }) => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => m, configurable: true });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => c, configurable: true });
    },
    { m: memory, c: cores },
  );
  await page.goto(E2E_PINNED_TIER_URL);
  await openCustomizer(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => readInstances(page, L.headsName).then((r) => r?.count ?? -1)).toBeGreaterThan(0);
  return { pageErrors, consoleErrors };
}

/**
 * A fixed window, not a frame count: under reduced motion nothing schedules a frame at all (no idle-redraw ticker), so waiting
 * for rendered frames could hang; a still scene is exactly what is asserted.
 */
async function expectStatic(page: Page, name: string) {
  const a = await readInstances(page, name);
  await page.waitForTimeout(L.staticWindowMs);
  const b = await readInstances(page, name);
  expect(a, name).not.toBeNull();
  expect(b!.translations, name).toEqual(a!.translations);
}

test("E1 MEDIUM CUSTOMIZE: villagers walk and motes move on the frames drawn anyway, nothing living takes taps", async ({ page }) => {
  const errors = await open(page, 4, 6);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "MEDIUM");
  const t = "MEDIUM" as const;
  const heads = await readInstances(page, L.headsName);
  expect(heads!.count).toBe(L.villagerCount[t]);
  const motes = await readInstances(page, L.motesName);
  expect(motes!.count).toBe(L.moteCount[t]);
  for (const [name, first] of [
    [L.headsName, heads!],
    [L.motesName, motes!],
  ] as const) {
    await expect
      .poll(async () => maxDelta((await readInstances(page, name))!.translations, first.translations), { timeout: L.moveTimeoutMs })
      .toBeGreaterThan(L.minMove);
  }
  expect(await livingInInteraction(page)).toEqual([]);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("E2 MEDIUM: villagers stand still and nothing ambient moves", async ({ page }) => {
    const errors = await open(page, 4, 6);
    await expect(root(page)).toHaveAttribute("data-quality-tier", "MEDIUM");
    expect((await readInstances(page, L.headsName))!.count).toBe(L.villagerCount.MEDIUM);
    for (const name of [L.headsName, L.motesName]) await expectStatic(page, name);
    expect(await livingInInteraction(page)).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});

test("E3 LOW: two standing villagers, no motes", async ({ page }) => {
  const errors = await open(page, 2, 2);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");
  expect((await readInstances(page, L.headsName))!.count).toBe(L.villagerCount.LOW);
  expect(await readInstances(page, L.motesName)).toBeNull();
  await expectStatic(page, L.headsName);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
