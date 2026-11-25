import { FLAME_FLICKER } from "@/config/krathongModel.config";

/**
 * Gentle candle-flame flicker (MFW-48, backlog 9.2 AC2): two slow sines (≤ FLAME_FLICKER_MAX_HZ) shared by every flame of a
 * canvas. Pure and allocation-free; static under reduced motion. Imported by its own path (not from the barrel).
 */
export interface FlameFlickerFrame {
  heightScale: number;
  widthScale: number;
  emissiveScale: number;
}

const MS_PER_SECOND = 1000;
const TAU = 2 * Math.PI;

export const STATIC_FLAME_FLICKER: Readonly<FlameFlickerFrame> = Object.freeze({ heightScale: 1, widthScale: 1, emissiveScale: 1 });

export function createFlameFlickerFrame(): FlameFlickerFrame {
  return { heightScale: 1, widthScale: 1, emissiveScale: 1 };
}

/** Allocation-free. Reduced motion or a non-finite time → {1,1,1}. */
export function writeFlameFlickerAt(timeMs: number, reducedMotion: boolean, out: FlameFlickerFrame): FlameFlickerFrame {
  if (reducedMotion || !Number.isFinite(timeMs)) {
    out.heightScale = 1;
    out.widthScale = 1;
    out.emissiveScale = 1;
    return out;
  }
  const seconds = timeMs / MS_PER_SECOND;
  const components = FLAME_FLICKER.components;
  let s = 0;
  for (let k = 0; k < components.length; k++) {
    const c = components[k];
    s += c.weight * Math.sin(TAU * c.hz * seconds + c.phaseRad);
  }
  out.heightScale = 1 + FLAME_FLICKER.heightAmplitude * s;
  out.widthScale = 1 - FLAME_FLICKER.widthAmplitude * s;
  out.emissiveScale = 1 + FLAME_FLICKER.emissiveAmplitude * s;
  return out;
}
