import {
  FIREWORK_LOOK,
  REDUCED_MOTION_TAP_CUE,
  SKY_LANTERN_LOOK,
  TAP_BOUNCE_LOOKS,
  TAP_SHAKE_LOOKS,
  VILLAGER_TAP_HOP,
  type NudgeTargetKind,
} from "@/config/gimmicks.config";
import { writeBounceAt, type BounceFrame } from "./gimmickCurves";
import { nudgeDurationMs } from "./sceneNudges";

/*
 * MFW-60 reaction curves. Pure, allocation-free, never throw (they run per frame). Ages that are not finite or are negative count as 0.
 * Reduced motion (invariant F, AC4): no motion, no particles in flight — a steady state that appears and then ends.
 */

const TAU = 2 * Math.PI;
const scratchBounce: BounceFrame = { scale: 1, done: true };

function normaliseAge(ageMs: number): number {
  return Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0;
}

export interface NudgeFrame {
  scale: number;
  shear: number;
  liftY: number;
  done: boolean;
}
export function createNudgeFrame(): NudgeFrame {
  return { scale: 1, shear: 0, liftY: 0, done: true };
}

/**
 * Reduced motion: scale = REDUCED_MOTION_TAP_CUE.scale[kind], shear 0, liftY 0, done = age ≥ holdMs (then scale 1).
 * shake: shear = shear·e^(−t/decay)·sin(2πt/period) of TAP_SHAKE_LOOKS[kind], scale 1. bounce: scale = writeBounceAt with
 * TAP_BOUNCE_LOOKS[kind]. hop: liftY = VILLAGER_TAP_HOP.heightScale·4u(1−u) (× villager scale by the caller), scale 1.
 * At or after the duration: neutral values (scale 1, shear 0, liftY 0) and done = true.
 */
export function writeNudgeAt(kind: NudgeTargetKind, ageMs: number, reducedMotion: boolean, out: NudgeFrame): NudgeFrame {
  const t = normaliseAge(ageMs);
  out.scale = 1;
  out.shear = 0;
  out.liftY = 0;
  if (t >= nudgeDurationMs(kind, reducedMotion)) {
    out.done = true;
    return out;
  }
  out.done = false;
  if (reducedMotion) {
    out.scale = REDUCED_MOTION_TAP_CUE.scale[kind];
    return out;
  }
  switch (kind) {
    case "tree":
    case "bush":
    case "reed": {
      const look = TAP_SHAKE_LOOKS[kind];
      out.shear = look.shear * Math.exp(-t / look.decayMs) * Math.sin((TAU * t) / look.periodMs);
      return out;
    }
    case "rock":
    case "pier":
      out.scale = writeBounceAt(t, false, scratchBounce, TAP_BOUNCE_LOOKS[kind]).scale;
      return out;
    case "villager": {
      const u = t / VILLAGER_TAP_HOP.durationMs;
      out.liftY = VILLAGER_TAP_HOP.heightScale * 4 * u * (1 - u);
      return out;
    }
  }
}

export interface ShellFrame {
  liftY: number;
  size: number;
  done: boolean; // the shell phase is over (or reduced motion: there is no shell)
}
export function createShellFrame(): ShellFrame {
  return { liftY: 0, size: 0, done: true };
}

/** liftY = burstHeight·(1 − (1 − u)²), u = age / shellRiseMs; size = shellSize. Reduced motion: done at once (no shell). */
export function writeFireworkShellAt(ageMs: number, reducedMotion: boolean, out: ShellFrame): ShellFrame {
  const t = normaliseAge(ageMs);
  if (reducedMotion || t >= FIREWORK_LOOK.shellRiseMs) {
    out.liftY = FIREWORK_LOOK.burstHeight;
    out.size = 0;
    out.done = true;
    return out;
  }
  const u = t / FIREWORK_LOOK.shellRiseMs;
  out.liftY = FIREWORK_LOOK.burstHeight * (1 - (1 - u) ** 2);
  out.size = FIREWORK_LOOK.shellSize;
  out.done = false;
  return out;
}

export interface SparkFrame {
  dx: number;
  dy: number;
  dz: number;
  size: number;
  visible: boolean;
  done: boolean;
}
export function createSparkFrame(): SparkFrame {
  return { dx: 0, dy: 0, dz: 0, size: 0, visible: false, done: true };
}

/**
 * Offsets from the BURST centre (launch + (0, burstHeight, 0)) along the unit direction d. Burst age b = age − shellRiseMs (reduced
 * motion: b = age). b < 0 → visible false. Else u = b / burstMs: r = burstRadius·(1 − (1 − u)³); dx = d.x·r, dy = d.y·r − sagDistance·u²,
 * dz = d.z·r; size = sparkSize·(1 − u); done at u ≥ 1. Reduced motion: r = burstRadius, no sag, size = sparkSize, done at b ≥ reducedMotionHoldMs.
 */
export function writeFireworkSparkAt(
  ageMs: number,
  reducedMotion: boolean,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: SparkFrame,
): SparkFrame {
  const t = normaliseAge(ageMs);
  const b = reducedMotion ? t : t - FIREWORK_LOOK.shellRiseMs;
  out.dx = 0;
  out.dy = 0;
  out.dz = 0;
  out.size = 0;
  if (b < 0) {
    out.visible = false;
    out.done = false;
    return out;
  }
  if (reducedMotion) {
    out.done = b >= FIREWORK_LOOK.reducedMotionHoldMs;
    out.visible = !out.done;
    if (out.visible) {
      out.dx = dirX * FIREWORK_LOOK.burstRadius;
      out.dy = dirY * FIREWORK_LOOK.burstRadius;
      out.dz = dirZ * FIREWORK_LOOK.burstRadius;
      out.size = FIREWORK_LOOK.sparkSize;
    }
    return out;
  }
  const u = b / FIREWORK_LOOK.burstMs;
  if (u >= 1) {
    out.visible = false;
    out.done = true;
    return out;
  }
  const r = FIREWORK_LOOK.burstRadius * (1 - (1 - u) ** 3);
  out.dx = dirX * r;
  out.dy = dirY * r - FIREWORK_LOOK.sagDistance * u * u;
  out.dz = dirZ * r;
  out.size = FIREWORK_LOOK.sparkSize * (1 - u);
  out.visible = true;
  out.done = false;
  return out;
}

/** Total firework life: reduced motion → reducedMotionHoldMs; else shellRiseMs + burstMs. */
export function fireworkDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? FIREWORK_LOOK.reducedMotionHoldMs : FIREWORK_LOOK.shellRiseMs + FIREWORK_LOOK.burstMs;
}

const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

/** Golden-angle (Fibonacci) unit directions into `out` (length ≥ 3·count); deterministic. Called once per mesh, never per frame. */
export function fireworkDirectionsInto(count: number, out: Float32Array): Float32Array {
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * GOLDEN_ANGLE_RAD;
    out[3 * i] = Math.cos(a) * r;
    out[3 * i + 1] = y;
    out[3 * i + 2] = Math.sin(a) * r;
  }
  return out;
}

export interface LanternFrame {
  dx: number; // offsets from the lamp head
  dy: number;
  dz: number;
  size: number; // scale factor of the lantern
  done: boolean;
}
export function createLanternFrame(): LanternFrame {
  return { dx: 0, dy: 0, dz: 0, size: 0, done: true };
}

/**
 * u = age / durationMs, w = swayAmplitude·sin(2π·age/swayPeriodMs): dy = riseHeight·(1 − (1 − u)²); dx = driftDirX·driftDistance·u
 * − driftDirZ·w; dz = driftDirZ·driftDistance·u + driftDirX·w (the sway is across the drift); size = 1 until u = fadeStartRatio, then
 * linear to 0 at u = 1; done at u ≥ 1. Reduced motion: dx = dz = 0, dy = reducedMotionOffsetY, size 1, done at age ≥ reducedMotionHoldMs.
 */
export function writeSkyLanternAt(ageMs: number, reducedMotion: boolean, out: LanternFrame): LanternFrame {
  const t = normaliseAge(ageMs);
  const L = SKY_LANTERN_LOOK;
  out.dx = 0;
  out.dz = 0;
  if (reducedMotion) {
    out.done = t >= L.reducedMotionHoldMs;
    out.dy = L.reducedMotionOffsetY;
    out.size = out.done ? 0 : 1;
    return out;
  }
  const u = t / L.durationMs;
  if (u >= 1) {
    out.dy = L.riseHeight;
    out.dx = L.driftDirX * L.driftDistance;
    out.dz = L.driftDirZ * L.driftDistance;
    out.size = 0;
    out.done = true;
    return out;
  }
  const w = L.swayAmplitude * Math.sin((TAU * t) / L.swayPeriodMs);
  out.dy = L.riseHeight * (1 - (1 - u) ** 2);
  out.dx = L.driftDirX * L.driftDistance * u - L.driftDirZ * w;
  out.dz = L.driftDirZ * L.driftDistance * u + L.driftDirX * w;
  out.size = u < L.fadeStartRatio ? 1 : (1 - u) / (1 - L.fadeStartRatio);
  out.done = false;
  return out;
}
