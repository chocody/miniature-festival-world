// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GIMMICK_BOUNCE, LAMP_GLOW_LOOK, RIPPLE_LOOK } from "@/config/gimmicks.config";
import {
  createBounceFrame,
  createLampGlowFrame,
  createRippleFrame,
  writeBounceAt,
  writeLampGlowFrameAt,
  writeRippleFrameAt,
} from "./gimmickCurves";

describe("writeRippleFrameAt", () => {
  const D = RIPPLE_LOOK.durationMs;
  it("starts small and bright", () => {
    const f = writeRippleFrameAt(0, false, createRippleFrame());
    expect(f.radius).toBe(RIPPLE_LOOK.startRadius);
    expect(f.intensity).toBe(RIPPLE_LOOK.peakIntensity);
    expect(f.done).toBe(false);
  });
  it("eases out at half time", () => {
    const f = writeRippleFrameAt(D / 2, false, createRippleFrame());
    expect(f.radius).toBeCloseTo(RIPPLE_LOOK.startRadius + (RIPPLE_LOOK.endRadius - RIPPLE_LOOK.startRadius) * (1 - 0.125), 12);
    expect(f.intensity).toBeCloseTo(RIPPLE_LOOK.peakIntensity * 0.25, 12);
  });
  it("is done at and after the duration", () => {
    for (const age of [D, D * 2]) {
      const f = writeRippleFrameAt(age, false, createRippleFrame());
      expect(f.done).toBe(true);
      expect(f.intensity).toBe(0);
    }
  });
  it("treats negative and NaN ages as 0", () => {
    const zero = { ...writeRippleFrameAt(0, false, createRippleFrame()) };
    expect(writeRippleFrameAt(-5, false, createRippleFrame())).toEqual(zero);
    expect(writeRippleFrameAt(Number.NaN, false, createRippleFrame())).toEqual(zero);
  });
  it("reduced motion keeps the final radius and only fades", () => {
    expect(writeRippleFrameAt(0, true, createRippleFrame()).radius).toBe(RIPPLE_LOOK.endRadius);
    const f = writeRippleFrameAt(D / 2, true, createRippleFrame());
    expect(f.radius).toBe(RIPPLE_LOOK.endRadius);
    expect(f.intensity).toBeCloseTo(RIPPLE_LOOK.peakIntensity * 0.25, 12);
  });
  it("returns the out object", () => {
    const out = createRippleFrame();
    expect(writeRippleFrameAt(10, false, out)).toBe(out);
  });
});

describe("writeBounceAt", () => {
  const { amplitude: A, periodMs: P, decayMs: tau, durationMs } = GIMMICK_BOUNCE;
  it("starts at 1 and peaks near a quarter period", () => {
    expect(writeBounceAt(0, false, createBounceFrame()).scale).toBe(1);
    expect(writeBounceAt(P / 4, false, createBounceFrame()).scale).toBeCloseTo(1 + A * Math.exp(-(P / 4) / tau), 12);
  });
  it("ends at exactly 1", () => {
    const f = writeBounceAt(durationMs, false, createBounceFrame());
    expect(f.scale).toBe(1);
    expect(f.done).toBe(true);
  });
  it("reduced motion never scales", () => {
    const f = writeBounceAt(P / 4, true, createBounceFrame());
    expect(f.scale).toBe(1);
    expect(f.done).toBe(true);
  });
});

describe("writeLampGlowFrameAt", () => {
  const L = LAMP_GLOW_LOOK;
  const peak = L.peakIntensity;
  it("starts dark", () => {
    expect(writeLampGlowFrameAt(0, false, createLampGlowFrame()).intensity).toBe(0);
  });
  it("reduced motion is steady at the peak with no bounce", () => {
    expect(writeLampGlowFrameAt(L.attackMs, true, createLampGlowFrame()).intensity).toBe(peak);
    for (let t = L.attackMs; t <= L.durationMs - L.releaseMs; t += 50) {
      const f = writeLampGlowFrameAt(t, true, createLampGlowFrame());
      expect(f.intensity).toBe(peak);
      expect(f.scale).toBe(1);
    }
    expect(writeLampGlowFrameAt(L.durationMs - L.releaseMs / 2, true, createLampGlowFrame()).intensity).toBeCloseTo(peak / 2, 12);
  });
  it("flickers within bounds in the hold window", () => {
    const seen = new Set<number>();
    const start = L.attackMs;
    const end = L.durationMs - L.releaseMs;
    for (let i = 0; i < 200; i++) {
      const t = start + ((end - start) * i) / 199;
      const f = writeLampGlowFrameAt(t, false, createLampGlowFrame());
      expect(f.intensity).toBeGreaterThanOrEqual(peak * (1 - L.flickerDepth) - 1e-9);
      expect(f.intensity).toBeLessThanOrEqual(peak + 1e-9);
      expect(f.scale).toBe(writeBounceAt(t, false, createBounceFrame()).scale);
      seen.add(f.intensity);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it("is done at the duration and deterministic", () => {
    const f = writeLampGlowFrameAt(L.durationMs, false, createLampGlowFrame());
    expect(f.done).toBe(true);
    expect(f.intensity).toBe(0);
    expect(f.scale).toBe(1);
    expect(writeLampGlowFrameAt(333, false, createLampGlowFrame())).toEqual(writeLampGlowFrameAt(333, false, createLampGlowFrame()));
  });
});
