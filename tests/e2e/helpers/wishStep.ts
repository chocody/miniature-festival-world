import { expect, type Page } from "@playwright/test";
import { CLEAN_WISH, WISH_NAME_LABEL, WISH_SUBMIT_LABEL, WISH_SWITCH_LABEL, WISH_TEXT_LABEL } from "../fixtures/wishCopy";

export {
  CLEAN_WISH,
  WISH_DIALOG_TITLE,
  WISH_NAME_LABEL,
  WISH_SUBMIT_LABEL,
  WISH_SWITCH_LABEL,
  WISH_TEXT_LABEL,
} from "../fixtures/wishCopy";

export interface WishStepOptions {
  readonly open?: boolean; // turn "เปิดให้ทุกคนเห็น" on (default off = private)
  readonly name?: string; // optional display name
}

/** Fills the WishModal (default: a clean private wish without a name) and submits it (WRITE_WISH → RITUAL_RELEASE). */
export async function completeWishStep(page: Page, text: string = CLEAN_WISH, options: WishStepOptions = {}): Promise<void> {
  if (options.name !== undefined) await page.getByRole("textbox", { name: WISH_NAME_LABEL }).fill(options.name);
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(text);
  const sw = page.getByRole("switch", { name: WISH_SWITCH_LABEL });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  if (options.open) await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", options.open ? "true" : "false");
  const submit = page.getByRole("button", { name: WISH_SUBMIT_LABEL });
  await expect(submit).toBeEnabled();
  await submit.click();
}
