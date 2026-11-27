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

/**
 * Crops `crop` (source px) out of each source shot and writes an `outPx` square PNG per id to `<outDir>/<id>.png`.
 * Paths are relative to the repo root. `page` is a Playwright page (DPR 1).
 * @param {import("@playwright/test").Page} page
 * @param {{ ids: readonly string[], sourcePath: (id: string) => string, sourceWidthPx: number,
 *   crop: { x: number, y: number, size: number }, outPx: number, outDir: string }} options
 */
export async function writeThumbnails(page, { ids, sourcePath, sourceWidthPx, crop, outPx, outDir }) {
  const scale = outPx / crop.size;
  mkdirSync(join(ROOT, outDir), { recursive: true });
  for (const id of ids) {
    const data = readFileSync(join(ROOT, sourcePath(id))).toString("base64");
    await page.setContent(
      `<html><body style="margin:0"><div style="width:${outPx}px;height:${outPx}px;overflow:hidden">` +
        `<img src="data:image/png;base64,${data}" style="display:block;width:${sourceWidthPx * scale}px;` +
        `margin-left:${-crop.x * scale}px;margin-top:${-crop.y * scale}px"></div></body></html>`,
    );
    await page.locator("img").evaluate((img) => (img.complete ? undefined : new Promise((r) => img.addEventListener("load", r))));
    const out = join(ROOT, outDir, `${id}.png`);
    await page.screenshot({ type: "png", path: out, clip: { x: 0, y: 0, width: outPx, height: outPx } });
    process.stdout.write(`${join(outDir, `${id}.png`)}\n`);
  }
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: THUMBNAIL_OUT_PX, height: THUMBNAIL_OUT_PX }, deviceScaleFactor: 1 });
    await writeThumbnails(page, {
      ids: THUMBNAIL_DESIGN_IDS,
      sourcePath: thumbnailSourcePath,
      sourceWidthPx: SOURCE_WIDTH_PX,
      crop: THUMBNAIL_CROP,
      outPx: THUMBNAIL_OUT_PX,
      outDir: THUMBNAIL_OUT_DIR,
    });
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
