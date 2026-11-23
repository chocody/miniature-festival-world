import { expect, test } from "@playwright/test";

const COMING_SOON = [
  "Christmas",
  "New Year",
  "Chinese New Year",
  "Valentine’s Day",
  "Songkran",
  "Mid-Autumn",
  "Halloween",
];

test("event selector shows Loy Krathong enabled and 7 festivals Coming Soon", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button")).toHaveCount(8);
  await expect(page.getByRole("button", { name: /Loy Krathong/ })).toBeEnabled();
  for (const name of COMING_SOON) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}`) });
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText("Coming Soon");
  }
});

test("flow walks from landing to SHARED_WORLD_EXPLORE", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-flow-state]");
  await expect(root).toHaveAttribute("data-flow-state", "LANDING_EVENT_SELECT");
  await page.getByRole("button", { name: /Loy Krathong/ }).click();
  await expect(root).toHaveAttribute("data-flow-state", "CUSTOMIZE_OBJECT");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "WRITE_WISH");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "RITUAL_RELEASE");
  await page.getByRole("button", { name: "ถัดไป" }).click();
  await expect(root).toHaveAttribute("data-flow-state", "SHARED_WORLD_EXPLORE");
  await expect(page.getByRole("button")).toHaveCount(0);
});
