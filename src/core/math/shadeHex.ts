const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;
const CHANNEL_MAX = 255;
const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;

/** "#RRGGBB" (any case) with each channel × factor, rounded and clamped to 0..255 → lowercase "#rrggbb". Invalid hex or non-finite factor → input unchanged. */
export function shadeHex(hex: string, factor: number): string {
  const match = HEX_COLOR.exec(hex);
  if (!match || !Number.isFinite(factor)) return hex;
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const c = parseInt(match[1].slice(i * HEX_PAIR_LENGTH, (i + 1) * HEX_PAIR_LENGTH), HEX_RADIX);
    const v = Math.min(CHANNEL_MAX, Math.max(0, Math.round(c * factor)));
    out += v.toString(HEX_RADIX).padStart(HEX_PAIR_LENGTH, "0");
  }
  return out;
}
