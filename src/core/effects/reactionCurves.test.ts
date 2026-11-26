// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FIREWORK_LOOK,
  LAMP_GLOW_LOOK,
  NO_BOUNCE,
  NUDGE_TARGET_KINDS,
  REDUCED_MOTION_TAP_CUE,
  SKY_LANTERN_LOOK,
  TAP_BOUNCE_LOOKS,
  TAP_SHAKE_LOOKS,
  VILLAGER_TAP_HOP,
  WCAG_MAX_FLASHES_PER_SECOND,
  WINDOW_GLOW_LOOK,
} from "@/config/gimmicks.config";
import { createBounceFrame, createLampGlowFrame, writeBounceAt, writeLampGlowFrameAt } from "./gimmickCurves";
import {
  createLanternFrame,
  createNudgeFrame,
  createShellFrame,
  createSparkFrame,
  fireworkDirectionsInto,
  fireworkDurationMs,
  writeFireworkShellAt,
  writeFireworkSparkAt,
  writeNudgeAt,
  writeSkyLanternAt,
} from "./reactionCurves";
import { createObjectPool } from "./objectPool";
import { nudgeDurationMs, retriggerGlow } from "./sceneNudges";

describe("nudge curves (MFW-60)", () => {
  it.each(["tree", "bush", "reed"] as const)("RC1 %s shake: 0 at t = 0, bounded, neutral and done at the duration", (kind) => {
    const look = TAP_SHAKE_LOOKS[kind];
    const f = createNudgeFrame();
    expect(writeNudgeAt(kind, 0, false, f).shear).toBe(0);
    let peak = 0;
    for (let t = 0; t < look.durationMs; t += 5) {
      writeNudgeAt(kind, t, false, f);
      expect(f.scale).toBe(1);
      expect(f.liftY).toBe(0);
      expect(f.done).toBe(false);
      peak = Math.max(peak, Math.abs(f.shear));
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(look.shear);
    expect(writeNudgeAt(kind, look.durationMs, false, f)).toEqual({ scale: 1, shear: 0, liftY: 0, done: true });
  });

  it("RC2 reduced motion: every kind holds the cue scale until holdMs, then is neutral and done; no shear, no lift", () => {
    const f = createNudgeFrame();
    for (const kind of NUDGE_TARGET_KINDS) {
      for (let t = 0; t < REDUCED_MOTION_TAP_CUE.holdMs; t += 25) {
        writeNudgeAt(kind, t, true, f);
        expect(f).toEqual({ scale: REDUCED_MOTION_TAP_CUE.scale[kind], shear: 0, liftY: 0, done: false });
      }
      expect(writeNudgeAt(kind, REDUCED_MOTION_TAP_CUE.holdMs, true, f)).toEqual({ scale: 1, shear: 0, liftY: 0, done: true });
    }
  });

  it("RC3 bounce (rock, pier) equals writeBounceAt with the kind's look; hop peaks at the middle", () => {
    const f = createNudgeFrame();
    for (const kind of ["rock", "pier"] as const) {
      for (let t = 0; t <= TAP_BOUNCE_LOOKS[kind].durationMs; t += 20) {
        const want = writeBounceAt(t, false, createBounceFrame(), TAP_BOUNCE_LOOKS[kind]).scale;
        expect(writeNudgeAt(kind, t, false, f).scale).toBeCloseTo(want, 12);
        expect(f.shear).toBe(0);
      }
    }
    expect(TAP_BOUNCE_LOOKS.pier.amplitude).toBeLessThan(TAP_BOUNCE_LOOKS.rock.amplitude);
    const D = VILLAGER_TAP_HOP.durationMs;
    expect(writeNudgeAt("villager", 0, false, f).liftY).toBe(0);
    expect(writeNudgeAt("villager", D / 2, false, f).liftY).toBeCloseTo(VILLAGER_TAP_HOP.heightScale, 12);
    expect(f.scale).toBe(1);
    expect(writeNudgeAt("villager", D, false, f)).toEqual({ scale: 1, shear: 0, liftY: 0, done: true });
    expect(nudgeDurationMs("villager", false)).toBe(D);
  });

  it("treats negative and NaN ages as 0 and returns the out object", () => {
    const f = createNudgeFrame();
    expect(writeNudgeAt("rock", -5, false, f)).toBe(f);
    expect({ ...writeNudgeAt("tree", Number.NaN, false, f) }).toEqual({ ...writeNudgeAt("tree", 0, false, createNudgeFrame()) });
  });
});

describe("firework curves (MFW-60)", () => {
  const L = FIREWORK_LOOK;
  it("RC4: the shell reaches burstHeight at shellRiseMs; sparks are hidden before the burst, then expand and shrink to 0", () => {
    const shell = createShellFrame();
    expect(writeFireworkShellAt(0, false, shell).liftY).toBe(0);
    expect(shell.size).toBe(L.shellSize);
    expect(writeFireworkShellAt(L.shellRiseMs - 1, false, shell).liftY).toBeLessThan(L.burstHeight);
    expect(writeFireworkShellAt(L.shellRiseMs, false, shell)).toEqual({ liftY: L.burstHeight, size: 0, done: true });
    const spark = createSparkFrame();
    expect(writeFireworkSparkAt(L.shellRiseMs - 1, false, 0, 1, 0, spark).visible).toBe(false);
    expect(writeFireworkSparkAt(L.shellRiseMs, false, 1, 0, 0, spark)).toMatchObject({ dx: 0, size: L.sparkSize, visible: true });
    let lastR = 0;
    for (let b = 0; b < L.burstMs; b += 50) {
      writeFireworkSparkAt(L.shellRiseMs + b, false, 1, 0, 0, spark);
      expect(spark.dx).toBeGreaterThanOrEqual(lastR);
      lastR = spark.dx;
    }
    const end = writeFireworkSparkAt(L.shellRiseMs + L.burstMs - 1e-6, false, 1, 0, 0, spark);
    expect(end.dx).toBeCloseTo(L.burstRadius, 6);
    expect(end.dy).toBeCloseTo(-L.sagDistance, 6);
    expect(end.size).toBeCloseTo(0, 6);
    expect(writeFireworkSparkAt(fireworkDurationMs(false), false, 1, 0, 0, spark)).toMatchObject({ visible: false, done: true });
    expect(fireworkDurationMs(false)).toBe(L.shellRiseMs + L.burstMs);
  });

  it("RC4 reduced motion: no shell, a static starburst, done at the hold", () => {
    expect(writeFireworkShellAt(0, true, createShellFrame()).done).toBe(true);
    const spark = createSparkFrame();
    for (let t = 0; t < L.reducedMotionHoldMs; t += 100) {
      expect({ ...writeFireworkSparkAt(t, true, 0, 0, 1, spark) }).toEqual({
        dx: 0,
        dy: 0,
        dz: L.burstRadius,
        size: L.sparkSize,
        visible: true,
        done: false,
      });
    }
    expect(writeFireworkSparkAt(L.reducedMotionHoldMs, true, 0, 0, 1, spark)).toMatchObject({ visible: false, done: true });
    expect(fireworkDurationMs(true)).toBe(L.reducedMotionHoldMs);
  });

  it("RC5: fireworkDirectionsInto gives deterministic unit vectors with a mean ≈ 0", () => {
    for (const n of [8, 16, 24]) {
      const a = fireworkDirectionsInto(n, new Float32Array(3 * n));
      const b = fireworkDirectionsInto(n, new Float32Array(3 * n));
      expect(Array.from(a)).toEqual(Array.from(b));
      const mean = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        expect(Math.hypot(a[3 * i], a[3 * i + 1], a[3 * i + 2])).toBeCloseTo(1, 5);
        for (let k = 0; k < 3; k++) mean[k] += a[3 * i + k] / n;
      }
      for (const m of mean) expect(Math.abs(m)).toBeLessThan(0.1);
    }
  });
});

describe("sky lantern curve (MFW-60)", () => {
  const L = SKY_LANTERN_LOOK;
  it("RC6: rises monotonically to riseHeight; size 1 before fadeStart and 0 at the end; done at durationMs", () => {
    const f = createLanternFrame();
    let lastY = -Infinity;
    for (let t = 0; t < L.durationMs; t += 40) {
      writeSkyLanternAt(t, false, f);
      expect(f.dy).toBeGreaterThanOrEqual(lastY);
      lastY = f.dy;
      if (t / L.durationMs < L.fadeStartRatio) expect(f.size).toBe(1);
      expect(f.size).toBeLessThanOrEqual(1);
      expect(f.done).toBe(false);
      expect(Math.abs(f.dz)).toBeLessThanOrEqual(L.swayAmplitude + 1e-12);
    }
    expect(writeSkyLanternAt(L.durationMs - 1e-6, false, f).size).toBeCloseTo(0, 5);
    expect(f.dy).toBeCloseTo(L.riseHeight, 5);
    expect(writeSkyLanternAt(L.durationMs, false, f)).toMatchObject({ size: 0, done: true });
  });

  it("RC6 reduced motion: a static lantern above the lamp, done at the hold", () => {
    const f = createLanternFrame();
    for (let t = 0; t < L.reducedMotionHoldMs; t += 100) {
      expect({ ...writeSkyLanternAt(t, true, f) }).toEqual({ dx: 0, dy: L.reducedMotionOffsetY, dz: 0, size: 1, done: false });
    }
    expect(writeSkyLanternAt(L.reducedMotionHoldMs, true, f).done).toBe(true);
  });
});

describe("window glow timing (MFW-60, RC7)", () => {
  const L = WINDOW_GLOW_LOOK;
  it.each([false, true])("attack, steady hold (no flicker), release; scale always 1 (reduced motion %s)", (reduced) => {
    const f = createLampGlowFrame();
    expect(writeLampGlowFrameAt(0, reduced, f, L, NO_BOUNCE).intensity).toBe(0);
    expect(writeLampGlowFrameAt(L.attackMs / 2, reduced, f, L, NO_BOUNCE).intensity).toBeCloseTo(L.peakIntensity / 2, 12);
    for (let t = L.attackMs; t <= L.durationMs - L.releaseMs; t += 50) {
      writeLampGlowFrameAt(t, reduced, f, L, NO_BOUNCE);
      expect(f.intensity).toBe(L.peakIntensity);
      expect(f.scale).toBe(1);
    }
    expect(writeLampGlowFrameAt(L.durationMs - L.releaseMs / 2, reduced, f, L, NO_BOUNCE).intensity).toBeCloseTo(L.peakIntensity / 2, 12);
    expect(writeLampGlowFrameAt(L.durationMs, reduced, f, L, NO_BOUNCE)).toEqual({ intensity: 0, scale: 1, done: true });
  });
});

/**
 * RC8 (WCAG 2.3.1): a "flash" = a pair of opposite brightness changes, each ≥ 10 % of the peak. Counts the reversals of a 1 ms sample
 * series (a change counts once it has moved ≥ 10 % of the peak from the last turning point) and returns the most in any 1 s window.
 */
function maxFlashesPerSecond(samples: readonly number[], dtMs: number): number {
  const peak = Math.max(...samples);
  if (peak <= 0) return 0;
  const threshold = peak / 10;
  const turns: number[] = []; // times of the confirmed brightness changes (rises and falls alternate)
  let extreme = samples[0];
  let dir = 0; // 1 rising, −1 falling, 0 not yet known
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i];
    if (dir === 1 && v > extreme) extreme = v;
    else if (dir === -1 && v < extreme) extreme = v;
    else if (dir !== -1 && extreme - v >= threshold) {
      turns.push(i * dtMs);
      dir = -1;
      extreme = v;
    } else if (dir !== 1 && v - extreme >= threshold) {
      turns.push(i * dtMs);
      dir = 1;
      extreme = v;
    }
  }
  let most = 0;
  for (const t of turns) most = Math.max(most, turns.filter((u) => u >= t && u < t + 1_000).length);
  return Math.floor(most / 2);
}

describe("RC8 WCAG 2.3.1 flash counter", () => {
  it("positive control: a 5 Hz on/off series counts 5 flashes per second", () => {
    const s = Array.from({ length: 2_000 }, (_, t) => (Math.floor(t / 100) % 2 === 0 ? 1 : 0));
    expect(maxFlashesPerSecond(s, 1)).toBeGreaterThan(WCAG_MAX_FLASHES_PER_SECOND);
  });

  it.each([false, true])("lamp and window glows re-tapped every 100 ms stay ≤ 3 flashes per second (reduced motion %s)", (reduced) => {
    for (const look of [LAMP_GLOW_LOOK, WINDOW_GLOW_LOOK]) {
      const entry = createObjectPool(1, () => ({})).acquire(0);
      const f = createLampGlowFrame();
      const samples: number[] = [];
      for (let t = 0; t < 4_000; t++) {
        if (t % 100 === 0 && t < 2_000) retriggerGlow(entry, t, look.attackMs);
        samples.push(writeLampGlowFrameAt(t - entry.startedAtMs, reduced, f, look, look === WINDOW_GLOW_LOOK ? NO_BOUNCE : undefined).intensity);
      }
      expect(maxFlashesPerSecond(samples, 1)).toBeLessThanOrEqual(WCAG_MAX_FLASHES_PER_SECOND);
    }
  });

  it.each([false, true])("one firework spark and one sky lantern (brightness = size²) are ≤ 3 flashes per second (reduced motion %s)", (reduced) => {
    const spark = createSparkFrame();
    const lantern = createLanternFrame();
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < 5_000; t++) {
      writeFireworkSparkAt(t, reduced, 1, 0, 0, spark);
      a.push(spark.visible ? spark.size ** 2 : 0);
      writeSkyLanternAt(t, reduced, lantern);
      b.push(lantern.done ? 0 : lantern.size ** 2);
    }
    expect(maxFlashesPerSecond(a, 1)).toBeLessThanOrEqual(WCAG_MAX_FLASHES_PER_SECOND);
    expect(maxFlashesPerSecond(b, 1)).toBeLessThanOrEqual(WCAG_MAX_FLASHES_PER_SECOND);
  });
});
