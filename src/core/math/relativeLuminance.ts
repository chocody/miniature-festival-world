/** WCAG 2.x relative luminance of an sRGB "#rrggbb" colour, in [0, 1]. */
export const SRGB_CHANNEL_MAX = 255;
export const SRGB_LINEAR_THRESHOLD = 0.04045;
export const SRGB_LINEAR_DIVISOR = 12.92;
export const SRGB_GAMMA_OFFSET = 0.055;
export const SRGB_GAMMA_SCALE = 1.055;
export const SRGB_GAMMA_EXPONENT = 2.4;
export const LUMINANCE_WEIGHTS = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new RangeError(`expected "#rrggbb", got ${JSON.stringify(hex)}`);
  const lin = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / SRGB_CHANNEL_MAX;
    return c <= SRGB_LINEAR_THRESHOLD
      ? c / SRGB_LINEAR_DIVISOR
      : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT;
  };
  return LUMINANCE_WEIGHTS.r * lin(1) + LUMINANCE_WEIGHTS.g * lin(3) + LUMINANCE_WEIGHTS.b * lin(5);
}
