import { expect, type Page } from "@playwright/test";

/** Duplicated literals of WISH_COPY in src/config/wish.config.ts (do not import src/ into Playwright). */
export const WISH_DIALOG_TITLE = "เขียนคำอธิษฐาน";
export const WISH_TEXT_LABEL = "คำอธิษฐานหรือสิ่งที่อยากปล่อยวาง";
export const WISH_PRIVATE_LABEL = "เก็บข้อความเป็นส่วนตัว";
export const WISH_PUBLIC_LABEL = "เผยแพร่แบบไม่ระบุตัวตน (Anonymous)";
export const WISH_SUBMIT_LABEL = "ถัดไป";
export const CLEAN_WISH = "ขอให้ทุกคนมีความสุข";

/** Fills the WishModal with a clean private wish and submits it (WRITE_WISH → RITUAL_RELEASE). */
export async function completeWishStep(page: Page, text: string = CLEAN_WISH): Promise<void> {
  await page.getByRole("textbox", { name: WISH_TEXT_LABEL }).fill(text);
  await page.getByRole("radio", { name: WISH_PRIVATE_LABEL }).check();
  const submit = page.getByRole("button", { name: WISH_SUBMIT_LABEL });
  await expect(submit).toBeEnabled();
  await submit.click();
}
