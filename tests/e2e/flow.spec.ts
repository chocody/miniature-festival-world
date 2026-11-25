import { expect, test } from "@playwright/test";
import { mockCreateCreation } from "./fixtures/ritualRoutes";
import { waitForActiveEvent } from "./helpers/activeEvent";
import { completeWishStep } from "./helpers/wishStep";

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
  await waitForActiveEvent(page);
  await expect(page.getByText("Coming Soon")).toHaveCount(0);
  await expect(page.getByText("เลือกเทศกาล")).toHaveCount(0);
  await expect(page.locator("[data-event-id]")).toHaveCount(0);
  for (const name of OTHER_FESTIVALS) {
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('[data-testid="customizer-panel"]')).toBeVisible();
});

test("flow walks from the active event to SHARED_WORLD_EXPLORE", async ({ page }) => {
  await mockCreateCreation(page);
  await page.goto("/");
  const root = page.locator("[data-flow-state]");
  await waitForActiveEvent(page);
  await expect(root).toHaveAttribute("data-interaction-mode", "CUSTOMIZE");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await expect(page.getByRole("note")).toHaveText(OWNERSHIP_WARNING);
  await completeWishStep(page);
  await expect(root).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-interaction-mode", "RITUAL_RELEASE");
  await page.getByRole("button", { name: "ปล่อยกระทง" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(root).toHaveAttribute("data-interaction-mode", "WORLD_EXPLORE");
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "ค้นหาของฉัน" })).toBeVisible();
});
