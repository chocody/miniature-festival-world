import { expect, type Page } from "@playwright/test";
import { mockCreateCreation } from "../fixtures/ritualRoutes";
import { E2E_EVENT_ID, e2eItemId, makeZoneItem } from "../fixtures/zoneFixtures";
import { openCustomizer } from "./activeEvent";
import { E2E_PINNED_TIER_URL, E2E_RIVER_HIT_PREFIX, installSceneProbe, waitForCameraRest } from "./sceneProbe";
import { completeWishStep } from "./wishStep";
import { expectWorldAfterRelease } from "./release";

/** MFW-80 helpers. No src/ imports: tests/unit/wish-bubble-e2e-literals.test.ts pins the mirrored literals to the app constants. */
export const E2E_WISH_BUBBLE_TESTID = "wish-bubble";
export const E2E_WISH_BUBBLE_VISIBLE_MS = 5_000; // = WISH_BUBBLE_TIMING.visibleMs
export const E2E_WISH_BUBBLE_FADE_MS = 600; // = WISH_BUBBLE_TIMING.fadeMs
export const E2E_WISH_BUBBLE_MARGIN_MS = 3_000;
export const E2E_BUBBLE_ALIGN_TOLERANCE_PX = 24;
export const E2E_BUBBLE_MIN_FOLLOW_PX = 8;
export const E2E_REPORT_LABEL = "รายงาน"; // = INSPECT_POPUP_COPY.report
export const E2E_REPORT_CONFIRM = "ยืนยันรายงาน"; // = INSPECT_POPUP_COPY.reportConfirm
export const E2E_REPORT_RECEIVED = "ได้รับรายงานแล้ว ขอบคุณที่แจ้งให้ทราบ"; // = INSPECT_POPUP_COPY.reportReceived

export const E2E_BUBBLE_ITEM_ID = e2eItemId(1, 1);
export const E2E_BUBBLE_WISH = "ขอให้สอบผ่าน";
export const E2E_OTHER_ITEM_ID = e2eItemId(1, 2);
export const E2E_OTHER_WISH = "ขอให้ฝนตก";

const LIGHT_PRESET_STORAGE_KEY = "mfw:lightPreset:v1"; // = LIGHT_PRESET_STORAGE_KEY (look.config.ts)
const BUBBLE_SPAWN_PROGRESS = 0.25;
const OTHER_SPAWN_PROGRESS = 0.31;

/** Two other people's krathongs with open wishes, both in frame at 390x844 (the scene-taps.spec.ts shape). */
export async function routeOtherKrathongs(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === "/api/zones",
    (route) => route.fulfill({ json: { eventId: E2E_EVENT_ID, zoneCount: 1 } }),
  );
  const specs = [
    { index: 1, progress: BUBBLE_SPAWN_PROGRESS, wish: E2E_BUBBLE_WISH },
    { index: 2, progress: OTHER_SPAWN_PROGRESS, wish: E2E_OTHER_WISH },
  ];
  await page.route(
    (url) => url.pathname === "/api/creations",
    (route) =>
      route.fulfill({
        json: {
          eventId: E2E_EVENT_ID,
          zoneId: 1,
          limit: 80,
          items: specs.map(({ index, progress, wish }) => {
            const item = makeZoneItem(1, index) as { coord: Record<string, unknown> };
            return {
              ...item,
              displayName: null,
              publicWishText: wish,
              coord: { ...item.coord, spawnProgress: progress },
              createdAt: new Date().toISOString(),
            };
          }),
        },
      }),
  );
  await mockCreateCreation(page); // after the zone routes: handles POST, GET falls back to them
}

/** 390x844 on the LOW tier (pinned), optional light preset, then the release walk to SHARED_WORLD_EXPLORE and a settled camera. */
export async function walkToWorldLow(page: Page, preset?: "DAY" | "NIGHT"): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", { get: () => 2, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2, configurable: true });
  });
  if (preset) {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [LIGHT_PRESET_STORAGE_KEY, preset] as const);
  }
  await installSceneProbe(page);
  await page.goto(E2E_PINNED_TIER_URL);
  await openCustomizer(page);
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await completeWishStep(page);
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await waitForCameraRest(page);
}

export interface BubbleKrathongReading {
  readonly bubble: { readonly cx: number; readonly bottom: number } | null;
  readonly krathong: { readonly x: number; readonly y: number } | null;
}

/** One evaluate: the bubble card's bottom centre (null when absent / hidden) and the screen point of the creation's river-hit proxy. */
export function readBubbleAndKrathong(page: Page, creationId: string): Promise<BubbleKrathongReading> {
  return page.evaluate(
    ({ testId, name }) => {
      const card = document.querySelector(`[data-testid="${testId}"]`);
      let bubble: { cx: number; bottom: number } | null = null;
      if (card instanceof HTMLElement) {
        const outer = card.parentElement;
        const r = card.getBoundingClientRect();
        if (outer && outer.style.visibility !== "hidden") bubble = { cx: r.left + r.width / 2, bottom: r.bottom };
      }
      const probe = (window as unknown as {
        __mfwProbe?: {
          scene: { traverse(visit: (o: { name: string; getWorldPosition(t: unknown): { project(c: unknown): { x: number; y: number } } }) => void): void } | null;
          camera: { position: { clone(): unknown } } | null;
        };
      }).__mfwProbe;
      const canvas = document.querySelector("canvas");
      let krathong: { x: number; y: number } | null = null;
      if (probe && probe.scene && probe.camera && canvas) {
        const camera = probe.camera;
        const rect = canvas.getBoundingClientRect();
        probe.scene.traverse((o) => {
          if (o.name !== name || krathong !== null) return;
          const p = o.getWorldPosition(camera.position.clone()).project(camera);
          const x = rect.left + ((p.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - p.y) / 2) * rect.height;
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) krathong = { x, y };
        });
      }
      return { bubble, krathong };
    },
    { testId: E2E_WISH_BUBBLE_TESTID, name: `${E2E_RIVER_HIT_PREFIX}${creationId}` },
  );
}
