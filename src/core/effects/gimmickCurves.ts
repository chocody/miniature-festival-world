import { GIMMICK_BOUNCE, KRATHONG_MARK_CUE, LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";

export interface RippleFrame {
  radius: number;
  intensity: number;
  done: boolean;
}
export interface LampGlowFrame {
  intensity: number;
  scale: number;
  done: boolean;
}
export interface BounceFrame {
  scale: number;
  done: boolean;
}
/** Which object carries the selection / Find My cue and since when (render-time only, never persisted). */
export interface MarkCueState {
  markedId: string | null;
  startedAtMs: number;
}

const TAU = 2 * Math.PI;
const scratchBounce: BounceFrame = { scale: 1, done: true };

export function createRippleFrame(): RippleFrame {
  return { radius: 0, intensity: 0, done: true };
}
export function createLampGlowFrame(): LampGlowFrame {
  return { intensity: 0, scale: 1, done: true };
}
export function createBounceFrame(): BounceFrame {
  return { scale: 1, done: true };
}

function normaliseAge(ageMs: number): number {
  return Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0;
}

/** Expanding ring that fades out. Under reduced motion the ring stays at its final size and only fades. Pure, allocation-free. */
export function writeRippleFrameAt(
  ageMs: number,
  reducedMotion: boolean,
  out: RippleFrame,
  look = RIPPLE_LOOK,
): RippleFrame {
  const t = normaliseAge(ageMs);
  if (t >= look.durationMs) {
    out.done = true;
    out.intensity = 0;
    out.radius = look.endRadius;
    return out;
  }
  const u = t / look.durationMs;
  out.radius = reducedMotion
    ? look.endRadius
    : look.startRadius + (look.endRadius - look.startRadius) * (1 - (1 - u) ** 3);
  out.intensity = look.peakIntensity * (1 - u) ** 2;
  out.done = false;
  return out;
}

/** Decaying sine bounce around scale 1. Reduced motion: no bounce. */
export function writeBounceAt(
  ageMs: number,
  reducedMotion: boolean,
  out: BounceFrame,
  bounce = GIMMICK_BOUNCE,
): BounceFrame {
  const t = normaliseAge(ageMs);
  if (reducedMotion || t >= bounce.durationMs) {
    out.scale = 1;
    out.done = true;
    return out;
  }
  out.scale = 1 + bounce.amplitude * Math.exp(-t / bounce.decayMs) * Math.sin((TAU * t) / bounce.periodMs);
  out.done = false;
  return out;
}

/** Attack → hold (flicker) → release. Reduced motion: steady, no flicker, no bounce. */
export function writeLampGlowFrameAt(
  ageMs: number,
  reducedMotion: boolean,
  out: LampGlowFrame,
  look = LAMP_GLOW_LOOK,
  bounce = GIMMICK_BOUNCE,
): LampGlowFrame {
  const t = normaliseAge(ageMs);
  if (t >= look.durationMs) {
    out.done = true;
    out.intensity = 0;
    out.scale = 1;
    return out;
  }
  const envelope =
    t < look.attackMs
      ? t / look.attackMs
      : t > look.durationMs - look.releaseMs
        ? (look.durationMs - t) / look.releaseMs
        : 1;
  const flicker = reducedMotion
    ? 1
    : 1 -
      (look.flickerDepth *
        (1 + (Math.sin((TAU * t) / look.flickerPeriodAMs) + Math.sin((TAU * t) / look.flickerPeriodBMs)) / 2)) /
        2;
  out.intensity = look.peakIntensity * envelope * flicker;
  out.scale = writeBounceAt(t, reducedMotion, scratchBounce, bounce).scale;
  out.done = false;
  return out;
}

export function createMarkCueState(): MarkCueState {
  return { markedId: null, startedAtMs: 0 };
}

/** When `markedId` differs from state.markedId: state.markedId = markedId, state.startedAtMs = nowMs (null clears). Returns state. Allocation-free. */
export function trackMarkCue(state: MarkCueState, markedId: string | null, nowMs: number): MarkCueState {
  if (state.markedId !== markedId) {
    state.markedId = markedId;
    state.startedAtMs = nowMs;
  }
  return state;
}

/**
 * Scale of the marked object at `ageMs` after the mark started: cue.scale × writeBounceAt(ageMs, reducedMotion).scale; out.done =
 * the bounce's done. Reduced motion: exactly cue.scale and done at once (no motion). Pure, allocation-free.
 */
export function writeMarkCueAt(
  ageMs: number,
  reducedMotion: boolean,
  out: BounceFrame,
  cue = KRATHONG_MARK_CUE,
  bounce = GIMMICK_BOUNCE,
): BounceFrame {
  writeBounceAt(ageMs, reducedMotion, out, bounce);
  out.scale *= cue.scale;
  return out;
}
