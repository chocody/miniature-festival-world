import { describe, expect, it } from "vitest";
import { AMBIENT_MOTES, LANTERN_FLICKER } from "@/config/events/loyKrathong.life.config";
import { MS_PER_SECOND, WCAG_MAX_FLASHES_PER_SECOND } from "@/config/gimmicks.config";
import { LIVING_WORLD_TIERS } from "@/config/performance.config";
import {
  buildCrossedFanData,
  createMoteFrameOut,
  lanternFlickerFactor,
  moteFrameInto,
  prepareMoteAnchors,
  resolveLivingWorldSettings,
  type AmbientMoteSpec,
  type LanternFlickerSpec,
} from "./ambientLife";
import { bankSurfaceY, type BankProfilePoint } from "./bankProfile";
import { buildBlobShadowFan } from "./blobShadow";
import { createRiverChannel } from "./riverEnvironment";

const channel = createRiverChannel({
  controlPoints: [
    { x: -10, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
  ],
  width: 2,
});
const profile: readonly BankProfilePoint[] = [
  { offset: 0, y: -0.3 },
  { offset: 0.25, y: -0.1 },
  { offset: 3, y: -0.1 },
];
const spec: AmbientMoteSpec = {
  progressFrom: 0.3,
  progressTo: 0.7,
  setbackMin: 1,
  setbackMax: 2,
  heightMin: 0.2,
  heightMax: 0.5,
  driftRadius: 0.1,
  driftPeriodMs: 4000,
  bobAmplitude: 0.05,
  bobPeriodMs: 3000,
  pulsePeriodMs: 2000,
  pulseMinScale: 0.5,
  radius: 0.04,
};
const flicker: LanternFlickerSpec = {
  amplitude: 0.1,
  components: [
    { weight: 0.5, periodMs: 1000, phaseRad: 0 },
    { weight: 0.5, periodMs: 3000, phaseRad: 1 },
  ],
};

/** Max number of strict local maxima of fn inside any `windowMs` window, sampled every `stepMs` over `spanMs`. */
function maxMaximaPerWindow(fn: (t: number) => number, spanMs: number, stepMs: number, windowMs: number): number {
  const maxima: number[] = [];
  let prev2 = fn(0);
  let prev = fn(stepMs);
  for (let t = 2 * stepMs; t <= spanMs; t += stepMs) {
    const cur = fn(t);
    if (prev > prev2 && prev > cur) maxima.push(t - stepMs);
    prev2 = prev;
    prev = cur;
  }
  let best = 0;
  for (let i = 0; i < maxima.length; i++) {
    let n = 0;
    while (i + n < maxima.length && maxima[i + n] - maxima[i] < windowMs) n++;
    best = Math.max(best, n);
  }
  return best;
}

describe("living-world settings (MFW-50 AC2, AC4)", () => {
  it("A1 HIGH equals its tier row; reduced motion stops every motion and the ticker, counts unchanged", () => {
    const high = resolveLivingWorldSettings("HIGH", false);
    const row = LIVING_WORLD_TIERS.HIGH;
    expect(high).toEqual({
      tier: "HIGH",
      villagerCount: row.villagerCount,
      villagersWalk: true,
      moteCount: row.moteCount,
      motesMove: true,
      lanternFlicker: true,
      idleRedrawIntervalMs: row.idleRedrawIntervalMs,
    });
    expect(high.idleRedrawIntervalMs).toBe(50);
    const rm = resolveLivingWorldSettings("HIGH", true);
    expect(rm).toMatchObject({ villagersWalk: false, motesMove: false, lanternFlicker: false, idleRedrawIntervalMs: null });
    expect(rm.villagerCount).toBe(row.villagerCount);
    expect(rm.moteCount).toBe(row.moteCount);
  });

  it("A2 LOW never ticks; FALLBACK_2D gets the LOW numbers", () => {
    expect(resolveLivingWorldSettings("LOW", false).idleRedrawIntervalMs).toBeNull();
    expect(resolveLivingWorldSettings("LOW", true).idleRedrawIntervalMs).toBeNull();
    expect(resolveLivingWorldSettings("FALLBACK_2D", false)).toEqual(resolveLivingWorldSettings("LOW", false));
    expect(resolveLivingWorldSettings("MEDIUM", false).idleRedrawIntervalMs).toBe(LIVING_WORLD_TIERS.MEDIUM.idleRedrawIntervalMs);
  });
});

describe("light motes (MFW-50 AC3)", () => {
  it("A3 count validation", () => {
    expect(prepareMoteAnchors(0, channel, profile, spec)).toEqual([]);
    expect(() => prepareMoteAnchors(-1, channel, profile, spec)).toThrow(RangeError);
    expect(() => prepareMoteAnchors(1.5, channel, profile, spec)).toThrow(RangeError);
  });

  it("A4 deterministic anchors over both banks, never over the water", () => {
    const a = prepareMoteAnchors(12, channel, profile, spec);
    expect(prepareMoteAnchors(12, channel, profile, spec)).toEqual(a);
    a.forEach((m, k) => {
      expect(Math.sign(m.z), String(k)).toBe(k % 2 === 0 ? -1 : 1);
      const lateral = Math.abs(m.z);
      expect(lateral).toBeGreaterThanOrEqual(1 + spec.setbackMin - 1e-9);
      expect(lateral).toBeLessThanOrEqual(1 + spec.setbackMax + 1e-9);
      const ground = bankSurfaceY(profile, lateral - 1);
      expect(m.y).toBeGreaterThanOrEqual(ground + spec.heightMin - 1e-9);
      expect(m.y).toBeLessThanOrEqual(ground + spec.heightMax + 1e-9);
      expect(m.x).toBeGreaterThanOrEqual(-10 + 20 * spec.progressFrom - 1e-9);
      expect(m.x).toBeLessThanOrEqual(-10 + 20 * spec.progressTo + 1e-9);
    });
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("A5 animated: drift circle, bob and pulse stay in range; drift is periodic", () => {
    const [anchor] = prepareMoteAnchors(3, channel, profile, spec).slice(1);
    const out = createMoteFrameOut();
    for (let t = 0; t < 10_000; t += 333) {
      moteFrameInto(anchor, t, true, spec, out);
      expect(Math.hypot(out.x - anchor.x, out.z - anchor.z)).toBeCloseTo(spec.driftRadius, 9);
      expect(Math.abs(out.y - anchor.y)).toBeLessThanOrEqual(spec.bobAmplitude + 1e-12);
      expect(out.radius).toBeGreaterThanOrEqual(spec.radius * spec.pulseMinScale - 1e-12);
      expect(out.radius).toBeLessThanOrEqual(spec.radius + 1e-12);
      const x = out.x;
      const z = out.z;
      moteFrameInto(anchor, t + spec.driftPeriodMs, true, spec, out);
      expect(out.x).toBeCloseTo(x, 9);
      expect(out.z).toBeCloseTo(z, 9);
    }
  });

  it("A6 not animated: the t = 0 frame at any time", () => {
    const [anchor] = prepareMoteAnchors(1, channel, profile, spec);
    const still = { ...moteFrameInto(anchor, 0, true, spec, createMoteFrameOut()) };
    for (const t of [0, 1234, 9e12]) expect({ ...moteFrameInto(anchor, t, false, spec, createMoteFrameOut()) }).toEqual(still);
  });

  it("A10 times are milliseconds: a quarter drift period is a quarter turn", () => {
    const anchor = { x: 0, y: 0, z: 0, phase: 0 };
    const out = moteFrameInto(anchor, 1000, true, spec, createMoteFrameOut()); // driftPeriodMs 4000
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(spec.driftRadius, 9);
  });

  it("A11 a non-finite time throws", () => {
    const [anchor] = prepareMoteAnchors(1, channel, profile, spec);
    expect(() => moteFrameInto(anchor, Number.NaN, true, spec, createMoteFrameOut())).toThrow(RangeError);
  });

  it("the soft mote shape: the blob fan crossed in three orthogonal planes, alpha 1 at the centre and 0 at the rim", () => {
    const fanSpec = { segments: 8, rings: 1, falloffExponent: 1 };
    const fan = buildBlobShadowFan(fanSpec);
    const crossed = buildCrossedFanData(fanSpec);
    expect(crossed.vertexCount).toBe(3 * fan.vertexCount);
    expect(crossed.indices.length).toBe(3 * fan.indices.length);
    const planeAxes = [1, 2, 0]; // the zero axis of plane 0 (xz), 1 (xy), 2 (yz)
    for (let p = 0; p < 3; p++) {
      for (let v = 0; v < fan.vertexCount; v++) {
        const o = (p * fan.vertexCount + v) * 3;
        expect(crossed.positions[o + planeAxes[p]]).toBe(0);
        const r = Math.hypot(crossed.positions[o], crossed.positions[o + 1], crossed.positions[o + 2]);
        const alpha = crossed.colors[(p * fan.vertexCount + v) * 4 + 3];
        expect(alpha).toBeCloseTo(v === 0 ? 1 : 0, 12); // soft: no hard edge
        expect(r).toBeCloseTo(v === 0 ? 0 : 1, 6);
      }
    }
    expect(Math.max(...crossed.indices)).toBe(crossed.vertexCount - 1);
  });
});

describe("lantern flicker (MFW-50 AC3)", () => {
  it("A8 lantern flicker stays within 1 ± amplitude", () => {
    for (let t = 0; t < 20_000; t += 37) {
      const f = lanternFlickerFactor(t, true, flicker);
      expect(f).toBeGreaterThanOrEqual(1 - flicker.amplitude - 1e-12);
      expect(f).toBeLessThanOrEqual(1 + flicker.amplitude + 1e-12);
    }
  });

  it("A9 not animated: flicker factor 1", () => {
    expect(lanternFlickerFactor(1234, false, flicker)).toBe(1);
  });
});

describe("WCAG 2.3.1: nothing flashes more than 3 times per second (MFW-50 AC4)", () => {
  it("A12 the maxima counter counts a 1 Hz sine once per second", () => {
    expect(maxMaximaPerWindow((t) => Math.sin((2 * Math.PI * t) / 1000), 20_000, 5, 1000)).toBe(1);
  });

  it("W1 the product lantern flicker", () => {
    const n = maxMaximaPerWindow((t) => lanternFlickerFactor(t, true, LANTERN_FLICKER), 20_000, 5, MS_PER_SECOND);
    expect(n).toBeLessThanOrEqual(WCAG_MAX_FLASHES_PER_SECOND);
  });

  it("W2 the product mote pulse (anchor 0 radius)", () => {
    const [anchor] = prepareMoteAnchors(1, channel, profile, AMBIENT_MOTES);
    const out = createMoteFrameOut();
    const n = maxMaximaPerWindow((t) => moteFrameInto(anchor, t, true, AMBIENT_MOTES, out).radius, 20_000, 5, MS_PER_SECOND);
    expect(n).toBeLessThanOrEqual(WCAG_MAX_FLASHES_PER_SECOND);
  });

  it("W3 positive control: a 5 Hz sine fails", () => {
    expect(maxMaximaPerWindow((t) => Math.sin((2 * Math.PI * 5 * t) / 1000), 20_000, 5, MS_PER_SECOND)).toBeGreaterThan(
      WCAG_MAX_FLASHES_PER_SECOND,
    );
  });
});
