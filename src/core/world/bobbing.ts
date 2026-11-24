import {
  RIVER_BOB_HEAVE_AMPLITUDE,
  RIVER_BOB_HEAVE_PERIOD_MS,
  RIVER_BOB_PITCH_AMPLITUDE_RAD,
  RIVER_BOB_PITCH_PERIOD_MS,
  RIVER_BOB_ROLL_AMPLITUDE_RAD,
  RIVER_BOB_ROLL_PERIOD_MS,
} from "@/config/riverFlow.config";

const TWO_PI = 2 * Math.PI;
const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_32_PRIME = 0x01000193;
const UINT32_RANGE = 2 ** 32;

/** Mutable out-parameter. Cosmetic, render-only, NEVER persisted. */
export interface BobbingOut {
  offsetY: number; // world units, added to the lane pose y
  pitchRad: number; // about the item's local X (after yaw)
  rollRad: number; // about the item's local Z (after yaw)
}

export function createBobbingOut(): BobbingOut {
  return { offsetY: 0, pitchRad: 0, rollRad: 0 };
}

/** Stable per-item phase in [0, 2π) from the public creation id (FNV-1a 32-bit over UTF-16 code units). */
export function bobbingPhaseFromId(id: string): number {
  let h = FNV1A_32_OFFSET_BASIS;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, FNV1A_32_PRIME);
  }
  return ((h >>> 0) / UINT32_RANGE) * TWO_PI;
}

function wave(nowMs: number, periodMs: number, phaseRad: number): number {
  return Math.sin(TWO_PI * ((nowMs % periodMs) / periodMs) + phaseRad);
}

/**
 * Procedural bobbing at wall-clock nowMs (epoch ms). Pure, stateless. Reduced motion (owner decision 23: only the
 * bobbing stops) or non-finite input → all zeros. Writes into and returns `out`. Never affects x or z.
 */
export function writeBobbingAt(nowMs: number, phaseRad: number, reducedMotion: boolean, out: BobbingOut): BobbingOut {
  if (reducedMotion || !Number.isFinite(nowMs) || !Number.isFinite(phaseRad)) {
    out.offsetY = 0;
    out.pitchRad = 0;
    out.rollRad = 0;
    return out;
  }
  out.offsetY = RIVER_BOB_HEAVE_AMPLITUDE * wave(nowMs, RIVER_BOB_HEAVE_PERIOD_MS, phaseRad);
  out.pitchRad = RIVER_BOB_PITCH_AMPLITUDE_RAD * wave(nowMs, RIVER_BOB_PITCH_PERIOD_MS, phaseRad);
  out.rollRad = RIVER_BOB_ROLL_AMPLITUDE_RAD * wave(nowMs, RIVER_BOB_ROLL_PERIOD_MS, phaseRad);
  return out;
}
