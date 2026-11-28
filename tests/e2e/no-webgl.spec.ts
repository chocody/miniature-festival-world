import { expect, test, type Page } from "@playwright/test";
import { E2E_NO_WEBGL_COPY } from "./fixtures/noWebgl";
import { E2E_STAGE_VIEWPORTS } from "./fixtures/stageFixtures";
import { E2E_CANCEL_CREATE_LABEL, E2E_START_CREATE_LABEL } from "./fixtures/landingFixtures";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { waitForLanding } from "./helpers/activeEvent";
import { expectWorldAfterRelease } from "./helpers/release";
import { completeWishStep } from "./helpers/wishStep";

/**
 * MFW-71 (backlog 11.5 AC2): without WebGL the stage shows a short Thai notice instead of the scene; no canvas, no control, no
 * three.js chunk and no page error. (The 2D fallback this replaces was removed on the owner's decision, 2026-11-26.)
 * MFW-154: the landing's start button is the one control left, and it still opens the flow over the notice.
 */
test.use({ viewport: { width: 360, height: 640 } });

/** String only the three.js renderer chunk contains in the production build (scene-gating.spec.ts proves it survives minification). */
const WEBGL_CHUNK_MARKER = "WebGLRenderer";
const root = (page: Page) => page.locator("[data-flow-state]");

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

async function blockWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
}

test("E1: no WebGL shows the notice and only the start button, with no page error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const scriptBodies = collectScriptBodies(page);
  await blockWebgl(page);
  // MFW-71 fix round (qa M1): no customizer control may ever be attached, not even before the profiler has decided.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawControl?: string[] };
    w.__sawControl = [];
    const CONTROL = 'button:not([data-testid="start-create"]), [role="tab"], [role="radio"], [data-testid="customizer-panel"]';
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.matches(CONTROL) || n.querySelector(CONTROL)) w.__sawControl!.push(n.tagName);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await waitForLanding(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");

  const notice = page.getByTestId("no-webgl-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toBeInViewport();
  await expect(notice.getByText(E2E_NO_WEBGL_COPY.title)).toBeVisible();
  await expect(notice.getByText(E2E_NO_WEBGL_COPY.help)).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button")).toHaveAttribute("data-testid", "start-create");
  await expect(page.getByRole("button")).toHaveAccessibleName(E2E_START_CREATE_LABEL);
  expect(await page.evaluate(() => (window as unknown as { __sawControl: string[] }).__sawControl)).toEqual([]);

  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(false);

  for (const vp of E2E_STAGE_VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await expect(notice).toBeInViewport();
    // qa L1: the word "การแสดงผล" stays on one line.
    const lines = await notice.locator("h1 span").evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  }
  expect(errors).toEqual([]);
});

test("E2: no WebGL — the start button opens the flow, the close control goes back, a release ends in the world", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const scriptBodies = collectScriptBodies(page);
  await blockWebgl(page);
  await mockCreateCreation(page);
  await page.goto("/");
  await waitForLanding(page);
  const start = page.getByRole("button", { name: E2E_START_CREATE_LABEL, exact: true });
  const notice = page.getByTestId("no-webgl-notice");

  await start.click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await expect(page.getByTestId("customizer-panel")).toBeVisible();
  await expect(notice).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.getByRole("button", { name: E2E_CANCEL_CREATE_LABEL, exact: true }).click();
  await expect(root(page)).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");

  await start.click();
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect((await scriptBodies()).some((body) => body.includes(WEBGL_CHUNK_MARKER))).toBe(false);
});
