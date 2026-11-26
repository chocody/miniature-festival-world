import { expect, test, type Page } from "@playwright/test";
import { E2E_NO_WEBGL_COPY } from "./fixtures/noWebgl";
import { E2E_STAGE_VIEWPORTS } from "./fixtures/stageFixtures";
import { waitForActiveEvent } from "./helpers/activeEvent";

/**
 * MFW-71 (backlog 11.5 AC2): without WebGL the stage shows a short Thai notice instead of the scene; no canvas, no control, no
 * three.js chunk and no page error. (The 2D fallback this replaces was removed on the owner's decision, 2026-11-26.)
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

test("E1: no WebGL shows the notice and nothing else, with no page error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const scriptBodies = collectScriptBodies(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  // MFW-71 fix round (qa M1): no customizer control may ever be attached, not even before the profiler has decided.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawControl?: string[] };
    w.__sawControl = [];
    const CONTROL = 'button, [role="tab"], [role="radio"], [data-testid="customizer-panel"]';
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
  await waitForActiveEvent(page);
  await expect(root(page)).toHaveAttribute("data-quality-tier", "LOW");

  const notice = page.getByTestId("no-webgl-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toBeInViewport();
  await expect(notice.getByText(E2E_NO_WEBGL_COPY.title)).toBeVisible();
  await expect(notice.getByText(E2E_NO_WEBGL_COPY.help)).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
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
