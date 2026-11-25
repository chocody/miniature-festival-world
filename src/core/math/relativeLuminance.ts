/** WCAG 2.x relative luminance of an sRGB "#rrggbb" colour, in [0, 1]. */
export const SRGB_CHANNEL_MAX = 255;
export const SRGB_LINEAR_THRESHOLD = 0.04045;
export const SRGB_LINEAR_DIVISOR = 12.92;
export const SRGB_GAMMA_OFFSET = 0.055;
export const SRGB_GAMMA_SCALE = 1.055;
export const SRGB_GAMMA_EXPONENT = 2.4;
export const LUMINANCE_WEIGHTS = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const RED_OFFSET = 1;
const GREEN_OFFSET = 3;
const BLUE_OFFSET = 5;
const HEX_CHANNEL_DIGITS = 2;
const HEX_RADIX = 16;

/** "#rrggbb" → linear-light sRGB channels in [0, 1]. Throws RangeError on any other string. */
export function hexToLinearRgb(hex: string): [number, number, number] {
  if (!HEX_COLOR.test(hex)) throw new RangeError(`expected "#rrggbb", got ${JSON.stringify(hex)}`);
  const lin = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + HEX_CHANNEL_DIGITS), HEX_RADIX) / SRGB_CHANNEL_MAX;
    return c <= SRGB_LINEAR_THRESHOLD
      ? c / SRGB_LINEAR_DIVISOR
      : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_SCALE) ** SRGB_GAMMA_EXPONENT;
  };
  return [lin(RED_OFFSET), lin(GREEN_OFFSET), lin(BLUE_OFFSET)];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToLinearRgb(hex);
  return LUMINANCE_WEIGHTS.r * r + LUMINANCE_WEIGHTS.g * g + LUMINANCE_WEIGHTS.b * b;
}
