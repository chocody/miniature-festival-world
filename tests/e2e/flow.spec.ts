import { expect, test } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { openCustomizer, waitForLanding } from "./helpers/activeEvent";
import { E2E_START_CREATE_LABEL } from "./fixtures/landingFixtures";
import { completeWishStep } from "./helpers/wishStep";
import { E2E_WORLD_ROTATE_BUTTON_NAME } from "./helpers/cameraProbe";
import { expectWorldAfterRelease } from "./helpers/release";

/** Accessible-name filter: every button except the 3D world rotate button (MFW-57). */
const NOT_WORLD_ROTATE_BUTTON = new RegExp(`^(?!${E2E_WORLD_ROTATE_BUTTON_NAME}$)`);

const OWNERSHIP_WARNING = "การล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนอุปกรณ์จะทำให้ไม่สามารถค้นคืนรายการผลงานของตัวเองได้";

const OTHER_FESTIVALS = [
  "Christmas",
  "New Year",
  "Chinese New Year",
  "Valentine’s Day",
  "Songkran",
  "Mid-Autumn",
  "Halloween",
];

test("opens straight into the active event — no selector, festival list or Coming Soon", async ({ page }) => {
  await page.goto("/");
  await waitForLanding(page);
  await expect(page.getByText("Coming Soon")).toHaveCount(0);
  await expect(page.getByText("เลือกเทศกาล")).toHaveCount(0);
  await expect(page.locator("[data-event-id]")).toHaveCount(0);
  for (const name of OTHER_FESTIVALS) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  }
  // MFW-154: the landing is the world; the customizer opens only from the start button.
  await expect(page.locator('[data-testid="customizer-panel"]')).toHaveCount(0);
  const start = page.getByRole("button", { name: E2E_START_CREATE_LABEL, exact: true });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('[data-testid="customizer-panel"]')).toBeVisible();
});

test("flow walks from the active event to SHARED_WORLD_EXPLORE", async ({ page }) => {
  await mockCreateCreation(page);
  await page.goto("/");
  const root = page.locator("[data-flow-state]");
  await openCustomizer(page);
  await expect(root).toHaveAttribute("data-interaction-mode", "CUSTOMIZE");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expect(page.getByRole("note")).toHaveText(OWNERSHIP_WARNING);
  await completeWishStep(page);
  await expect(root).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-interaction-mode", "RITUAL_RELEASE");
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expectWorldAfterRelease(page);
  await expect(root).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
  // MFW-57 / MFW-74 / MFW-85: the HUD column holds the rotate button (open question 34), Find My, the day/night toggle and the
  // sky-launch switch; every other button stays absent.
  await expect(page.getByRole("button", { name: NOT_WORLD_ROTATE_BUTTON })).toHaveCount(4); // Find My + day/night toggle + sky-launch switch (MFW-85) + the start button, MFW-154
  await expect(page.getByTestId("sky-launch-switch")).toBeVisible();
  await expect(page.getByRole("button", { name: "ค้นหาของฉัน" })).toBeVisible();
});
