import { TIER_BUDGETS, TIER_MAX_RENDER_PIXELS, type RenderTier } from "@/config/performance.config";

/** R3F `dpr` range: the renderer uses min(max(min, devicePixelRatio), max). */
export type CanvasDprRange = [min: number, max: number];

/**
 * Pixel-ratio range of the 3D canvas for a tier (MFW-54): [1, pixelRatioCap], lowered so that `screenAreaCssPx` × ratio² stays
 * within TIER_MAX_RENDER_PIXELS[tier]. When the cap needs a ratio below 1 the range collapses to that ratio. Area not finite or
 * ≤ 0 (unknown, e.g. jsdom) or no cap → [1, pixelRatioCap].
 */
export function getCanvasDprRange(tier: RenderTier, screenAreaCssPx: number): CanvasDprRange {
  const cap = TIER_BUDGETS[tier].pixelRatioCap;
  const maxPixels = TIER_MAX_RENDER_PIXELS[tier];
  if (maxPixels === null || !Number.isFinite(screenAreaCssPx) || screenAreaCssPx <= 0) return [1, cap];
  const ratio = Math.min(cap, Math.sqrt(maxPixels / screenAreaCssPx));
  return ratio >= 1 ? [1, ratio] : [ratio, ratio];
}
