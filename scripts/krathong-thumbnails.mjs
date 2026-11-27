#!/usr/bin/env node
// Design picker thumbnails (MFW-78, docs/design/models.md §11).
//
//   node scripts/krathong-thumbnails.mjs
//
// Crops the square around the hero krathong out of the committed MFW-76 DAY customize shots
// (docs/design/screenshots/mfw-76/after-<id>-customize-day.png, 390 × 844, DPR 1) and writes a THUMBNAIL_OUT_PX square PNG per
// design to public/ui/krathong-designs/<id>.png, using the Playwright Chromium already installed for e2e (no new dependency).
// Honors PW_CHROMIUM_PATH. Re-run when a design palette changes or the MFW-76 shots are retaken (re-probe THUMBNAIL_CROP).
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** = KRATHONG_DESIGN_IDS (src/config/krathongDesigns.config.ts), in the same order; KT1 pins it. */
export const THUMBNAIL_DESIGN_IDS = Object.freeze(["banana_leaf_01", "lotus_bud_01", "marigold_01", "rose_candles_01", "naga_01"]);
export const THUMBNAIL_SOURCE_DIR = "docs/design/screenshots/mfw-76";
/** Width of the source shots (CSS px at DPR 1). */
const SOURCE_WIDTH_PX = 390;
/** The square around the hero krathong in the MFW-76 customize shots (source px). */
export const THUMBNAIL_CROP = Object.freeze({ x: 95, y: 285, size: 200 });
/** = KRATHONG_DESIGN_THUMBNAIL_PX; KT1 pins it. */
export const THUMBNAIL_OUT_PX = 112;
export const THUMBNAIL_OUT_DIR = "public/ui/krathong-designs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Source shot of one design. */
export function thumbnailSourcePath(id) {
  return join(THUMBNAIL_SOURCE_DIR, `after-${id}-customize-day.png`);
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: THUMBNAIL_OUT_PX, height: THUMBNAIL_OUT_PX }, deviceScaleFactor: 1 });
    const scale = THUMBNAIL_OUT_PX / THUMBNAIL_CROP.size;
    mkdirSync(join(ROOT, THUMBNAIL_OUT_DIR), { recursive: true });
    for (const id of THUMBNAIL_DESIGN_IDS) {
      const data = readFileSync(join(ROOT, thumbnailSourcePath(id))).toString("base64");
      await page.setContent(
        `<html><body style="margin:0"><div style="width:${THUMBNAIL_OUT_PX}px;height:${THUMBNAIL_OUT_PX}px;overflow:hidden">` +
          `<img src="data:image/png;base64,${data}" style="display:block;width:${SOURCE_WIDTH_PX * scale}px;` +
          `margin-left:${-THUMBNAIL_CROP.x * scale}px;margin-top:${-THUMBNAIL_CROP.y * scale}px"></div></body></html>`,
      );
      await page.locator("img").evaluate((img) => (img.complete ? undefined : new Promise((r) => img.addEventListener("load", r))));
      const out = join(ROOT, THUMBNAIL_OUT_DIR, `${id}.png`);
      await page.screenshot({ type: "png", path: out, clip: { x: 0, y: 0, width: THUMBNAIL_OUT_PX, height: THUMBNAIL_OUT_PX } });
      process.stdout.write(`${join(THUMBNAIL_OUT_DIR, `${id}.png`)}\n`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
