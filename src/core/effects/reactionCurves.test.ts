// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CHIMNEY_SMOKE_LOOK,
  FALLING_LEAF_LOOK,
  TAP_SHAKE_WIND,
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
import { CHIMNEY_SMOKE_PUFFS_PER_TAP } from "@/config/performance.config";
import { createBounceFrame, createLampGlowFrame, writeBounceAt, writeLampGlowFrameAt } from "./gimmickCurves";
import {
  chimneySmokeDurationMs,
  chimneySmokeEmitMs,
  createFallingLeafFrame,
  createSmokePuffFrame,
  fallingLeavesDurationMs,
  fallingLeavesEmitMs,
  writeFallingLeafAt,
  writeSmokePuffAt,
  writeSmokeDriftInto,
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

describe("chimney smoke curve (MFW-72 / MFW-84)", () => {
  const L = CHIMNEY_SMOKE_LOOK;

  it("RC9: puffs are staggered, rise and drift from the origin, grow then shrink to 0; done after the puff life", () => {
    const f = createSmokePuffFrame();
    for (const k of [1, 3]) {
      writeSmokePuffAt(k * L.staggerMs - 1, k, 1, 0, f);
      expect(f.visible, `puff ${k}`).toBe(false);
      expect(f.done).toBe(false);
      writeSmokePuffAt(k * L.staggerMs, k, 1, 0, f);
      expect(f.visible).toBe(true);
    }
    writeSmokePuffAt(0, 0, 1, 0, f);
    expect([f.dx, f.dy, f.dz]).toEqual([0, 0, 0]);
    expect(f.radius).toBe(L.startRadius);
    writeSmokePuffAt(0.5 * L.puffLifeMs, 0, 1, 0, f);
    expect(f.dy).toBeCloseTo(0.5 * L.riseHeight, 9); // MFW-84: a linear rise
    let prev = -Infinity;
    let a = 0;
    for (; a < L.fadeStartRatio * L.puffLifeMs; a += 10) {
      writeSmokePuffAt(a, 0, 1, 0, f);
      expect(f.radius).toBeGreaterThan(prev);
      prev = f.radius;
    }
    writeSmokePuffAt(a, 0, 1, 0, f); // u = fadeStartRatio: the peak (continuous with the growth)
    expect(f.radius).toBeGreaterThanOrEqual(prev);
    prev = f.radius;
    for (a += 10; a < L.puffLifeMs; a += 10) {
      writeSmokePuffAt(a, 0, 1, 0, f);
      expect(f.radius).toBeLessThan(prev);
      prev = f.radius;
    }
    expect(prev).toBeLessThan(0.01);
    const k = 2;
    writeSmokePuffAt(k * L.staggerMs + L.puffLifeMs - 1, k, 1, 0, f);
    expect(f.done).toBe(false);
    writeSmokePuffAt(k * L.staggerMs + L.puffLifeMs, k, 1, 0, f);
    expect(f.done).toBe(true);
    expect(f.visible).toBe(false);
    expect(f.radius).toBe(0);
    for (const puffs of Object.values(CHIMNEY_SMOKE_PUFFS_PER_TAP)) {
      expect(chimneySmokeDurationMs(puffs)).toBe((puffs - 1) * L.staggerMs + L.puffLifeMs);
      expect(chimneySmokeEmitMs(puffs)).toBe((puffs - 1) * L.staggerMs);
    }
  });

  it("RC9: the drift follows the wind and stays within driftDistance + wobble; the rise is monotonic", () => {
    const f = createSmokePuffFrame();
    let prevY = -Infinity;
    for (let a = 0; a < L.puffLifeMs; a += 25) {
      writeSmokePuffAt(a + L.staggerMs, 1, 1, 0, f);
      expect(f.dy).toBeGreaterThanOrEqual(prevY);
      prevY = f.dy;
      expect(Math.hypot(f.dx, f.dz)).toBeLessThanOrEqual(L.driftDistance + L.wobbleAmplitude + 1e-9);
    }
  });
});

describe("falling leaf curve (MFW-72)", () => {
  const L = FALLING_LEAF_LOOK;

  it("RC10: leaves are staggered, land at fallMs, rest still at full size, shrink to 0 over fadeMs, then are done", () => {
    const f = createFallingLeafFrame();
    for (const k of [1, 4]) {
      writeFallingLeafAt(k * L.staggerMs - 1, k, f);
      expect(f.visible, `leaf ${k}`).toBe(false);
      expect(f.size).toBe(0);
      expect(f.done).toBe(false);
    }
    const k = 2;
    const t0 = k * L.staggerMs;
    writeFallingLeafAt(t0 + L.fallMs, k, f);
    expect(f.fall).toBe(1);
    expect(f.sway).toBe(0);
    expect(f.tiltRad).toBe(0);
    const landed = { ...f };
    for (let a = L.fallMs; a < L.fallMs + L.restMs; a += 50) {
      writeFallingLeafAt(t0 + a, k, f);
      expect(f).toEqual(landed);
      expect(f.size).toBe(1);
    }
    writeFallingLeafAt(t0 + L.fallMs + L.restMs + L.fadeMs / 2, k, f);
    expect(f.size).toBeCloseTo(0.5, 9);
    expect(f.visible).toBe(true);
    writeFallingLeafAt(t0 + L.fallMs + L.restMs + L.fadeMs, k, f);
    expect(f.done).toBe(true);
    expect(f.visible).toBe(false);
    expect(fallingLeavesDurationMs(6)).toBe(5 * 140 + 1_600 + 1_200 + 500);
    expect(fallingLeavesDurationMs(6)).toBe(4_000);
    expect(fallingLeavesEmitMs(6)).toBe(2_300);
  });

  it("RC10: the fall is monotonic non-decreasing, size 1 in the air; sway and tilt are bounded", () => {
    const f = createFallingLeafFrame();
    let prev = -Infinity;
    for (let a = 0; a <= L.fallMs + L.restMs; a += 5) {
      writeFallingLeafAt(a, 0, f);
      expect(f.fall).toBeGreaterThanOrEqual(prev);
      prev = f.fall;
      expect(f.size).toBe(1);
      expect(Math.abs(f.sway)).toBeLessThanOrEqual(L.swayAmplitude);
      expect(Math.abs(f.tiltRad)).toBeLessThanOrEqual(L.flightPitchRad + L.tiltAmplitudeRad);
      if (f.fall < 0.5) expect(f.tiltRad).toBeLessThan(0); // pitched up while it falls: the face shows (fix round)
    }
    writeFallingLeafAt(0, 0, f);
    expect(f.fall).toBe(0);
  });
});

describe("MFW-72 curve robustness", () => {
  it("RC11: negative and NaN ages count as 0; the out object is returned", () => {
    const s = createSmokePuffFrame();
    expect(writeSmokePuffAt(-50, 0, 1, 0, s)).toBe(s);
    expect(s.radius).toBe(CHIMNEY_SMOKE_LOOK.startRadius);
    writeSmokePuffAt(Number.NaN, 0, 1, 0, s);
    expect(s.radius).toBe(CHIMNEY_SMOKE_LOOK.startRadius);
    expect(s.dy).toBe(0);
    const l = createFallingLeafFrame();
    expect(writeFallingLeafAt(-50, 0, l)).toBe(l);
    expect(l.fall).toBe(0);
    expect(l.visible).toBe(true);
    writeFallingLeafAt(Number.NaN, 0, l);
    expect(l.fall).toBe(0);
  });

  it("RC12 (WCAG 2.3.1): sampled every 1 ms, a puff's radius and a leaf's size rise / fall at most once", () => {
    const changes = (values: number[]) => {
      let turns = 0;
      let dir = 0;
      for (let i = 1; i < values.length; i++) {
        const d = Math.sign(values[i] - values[i - 1]);
        if (d !== 0 && d !== dir) {
          if (dir !== 0) turns++;
          dir = d;
        }
      }
      return turns;
    };
    const s = createSmokePuffFrame();
    const radii: number[] = [];
    for (let t = 0; t <= chimneySmokeDurationMs(1); t++) radii.push(writeSmokePuffAt(t, 0, 1, 0, s).radius);
    expect(changes(radii)).toBeLessThanOrEqual(1);
    const l = createFallingLeafFrame();
    const sizes: number[] = [];
    for (let t = 0; t <= fallingLeavesDurationMs(1); t++) sizes.push(writeFallingLeafAt(t, 0, l).size);
    expect(changes(sizes)).toBeLessThanOrEqual(1);
  });
});

describe("smoke drift and direction (MFW-84)", () => {
  const L = CHIMNEY_SMOKE_LOOK;
  const wind = { x: TAP_SHAKE_WIND.windDirX, z: TAP_SHAKE_WIND.windDirZ };

  it("RC13: the drift is the camera's horizontal right axis, normalised and signed downwind; bad input → TAP_SHAKE_WIND", () => {
    const out = { x: 9, z: 9 };
    expect(writeSmokeDriftInto(1, 0, out)).toBe(out);
    expect(out).toEqual({ x: 1, z: 0 });
    expect(writeSmokeDriftInto(-1, 0, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 }); // the sign follows TAP_SHAKE_WIND (+x)
    expect(writeSmokeDriftInto(2, 0, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 }); // normalised
    const yaw = 0.9; // camera yawed: right = (cos, −sin), back = (sin, cos)
    const r = writeSmokeDriftInto(Math.cos(yaw), -Math.sin(yaw), { x: 0, z: 0 });
    expect(r.x).toBeCloseTo(Math.cos(yaw), 12);
    expect(r.z).toBeCloseTo(-Math.sin(yaw), 12);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 12);
    expect(Math.abs(r.x * Math.sin(yaw) + r.z * Math.cos(yaw))).toBeLessThan(1e-12); // never toward / away from the viewer
    expect(writeSmokeDriftInto(0, 1, { x: 0, z: 0 })).toEqual({ x: 0, z: 1 }); // right ⟂ wind: a tie keeps +right
    for (const [x, z] of [
      [0, 0],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
    ]) {
      expect(writeSmokeDriftInto(x, z, { x: 9, z: 9 })).toEqual(wind);
    }
  });

  it("RC14: the smoke never moves down: each puff's centre, top and bottom never decrease and dy ≥ 0", () => {
    const f = createSmokePuffFrame();
    for (let k = 0; k < CHIMNEY_SMOKE_PUFFS_PER_TAP.HIGH; k++) {
      let prev: { dy: number; top: number; bottom: number } | null = null;
      for (let age = k * L.staggerMs; age <= k * L.staggerMs + L.puffLifeMs - 1; age += 5) {
        writeSmokePuffAt(age, k, 1, 0, f);
        if (!f.visible) continue;
        const now = { dy: f.dy, top: f.dy + f.radius, bottom: f.dy - f.radius };
        expect(f.dy, `puff ${k} at ${age}`).toBeGreaterThanOrEqual(0);
        if (prev) {
          expect(now.dy, `puff ${k} centre at ${age}`).toBeGreaterThanOrEqual(prev.dy - 1e-12);
          expect(now.top, `puff ${k} top at ${age}`).toBeGreaterThanOrEqual(prev.top - 1e-12);
          expect(now.bottom, `puff ${k} bottom at ${age}`).toBeGreaterThanOrEqual(prev.bottom - 1e-12);
        }
        prev = now;
      }
      expect(prev, `puff ${k} was drawn`).not.toBeNull();
    }
  });

  it("RC15: the horizontal offset (drift and wobble) runs along the drift and stays within driftDistance + wobble", () => {
    const f = createSmokePuffFrame();
    for (const age of [0, 137, 450, 900, 1_333, L.puffLifeMs - 1]) {
      writeSmokePuffAt(age, 1, 0.6, 0.8, f);
      writeSmokePuffAt(age + L.staggerMs, 1, 0.6, 0.8, f);
      expect(Math.abs(f.dx * 0.8 - f.dz * 0.6), `age ${age}`).toBeLessThan(1e-12);
      expect(Math.hypot(f.dx, f.dz)).toBeLessThanOrEqual(L.driftDistance + L.wobbleAmplitude + 1e-9);
    }
    for (const age of [100, 700, 1_500]) {
      writeSmokePuffAt(age, 0, 0, 0, f);
      expect(f.dz).toBe(0); // a zero drift wobbles along x only
    }
  });
});
