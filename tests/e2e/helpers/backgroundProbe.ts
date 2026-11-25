import type { Page } from "@playwright/test";
import type { CoverageSamplePoint } from "../fixtures/stageFixtures";

/*
 * MFW-68: reads stage pixels from a page screenshot (no preserveDrawingBuffer, no new dependency). An injected style hides every
 * overlay so only the stage shows; the PNG is decoded in the page (createImageBitmap + OffscreenCanvas).
 */
export interface StagePixel {
  readonly name: CoverageSamplePoint["name"];
  readonly rgb: [number, number, number];
}

/** Only the WebGL canvas stays visible (overlays, the ritual chip, the hint and the rotate button are hidden). */
export const STAGE_ONLY_CANVAS_CSS = "body * { visibility: hidden !important; } canvas { visibility: visible !important; }";
/** Control: the canvas is hidden too, so only the stage section's own background colour shows. */
export const STAGE_ONLY_SECTION_CSS =
  'body * { visibility: hidden !important; } [aria-label="Toy-like night river preview"] { visibility: visible !important; }';

export async function readStagePixels(page: Page, points: readonly CoverageSamplePoint[], hideCss?: string): Promise<StagePixel[]> {
  const tag = await page.addStyleTag({ content: hideCss ?? STAGE_ONLY_CANVAS_CSS });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const png = await page.screenshot({ scale: "css" });
  await tag.evaluate((el) => (el as Element).remove());
  return page.evaluate(
    async ({ b64, pts }) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return pts.map((p) => {
        const d = ctx.getImageData(p.x, p.y, 1, 1).data;
        return { name: p.name, rgb: [d[0], d[1], d[2]] as [number, number, number] };
      });
    },
    { b64: png.toString("base64"), pts: points },
  );
}
