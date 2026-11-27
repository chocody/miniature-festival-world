import { test } from "@playwright/test";
import { locateKrathongById } from "./helpers/sceneProbe";
import { E2E_BUBBLE_ITEM_ID, E2E_WISH_BUBBLE_TESTID, routeOtherKrathongs, walkToWorldLow } from "./helpers/wishBubble";

/** MFW-80 X1: before / after screenshots at phone size, DAY and NIGHT. Waits for "dialog or bubble", so it also runs before the change. */
test.use({ timezoneId: "Asia/Bangkok", hasTouch: true, isMobile: true });

for (const preset of ["DAY", "NIGHT"] as const) {
  test(`X1 phone ${preset}`, async ({ page }, testInfo) => {
    await routeOtherKrathongs(page);
    await walkToWorldLow(page, preset);
    const point = await locateKrathongById(page, E2E_BUBBLE_ITEM_ID);
    await page.touchscreen.tap(point.x, point.y);
    await page.getByRole("dialog").or(page.getByTestId(E2E_WISH_BUBBLE_TESTID)).first().waitFor();
    await page.waitForTimeout(400); // let the popup / bubble settle
    const name = `wish-bubble-phone-${preset.toLowerCase()}`;
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: "image/png" });
  });
}
