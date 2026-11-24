// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RIVER_BOB_HEAVE_AMPLITUDE,
  RIVER_BOB_HEAVE_PERIOD_MS,
  RIVER_BOB_PITCH_AMPLITUDE_RAD,
  RIVER_BOB_PITCH_PERIOD_MS,
  RIVER_BOB_ROLL_AMPLITUDE_RAD,
  RIVER_BOB_ROLL_PERIOD_MS,
} from "@/config/riverFlow.config";
import { bobbingPhaseFromId, createBobbingOut, writeBobbingAt } from "./bobbing";

const T0 = 1_700_000_000_000;
const TWO_PI = 2 * Math.PI;

describe("writeBobbingAt", () => {
  it("is exactly zero under reduced motion", () => {
    for (const now of [T0, T0 + 1234, T0 + 999_999]) {
      const out = writeBobbingAt(now, 1.3, true, createBobbingOut());
      expect(out).toEqual({ offsetY: 0, pitchRad: 0, rollRad: 0 });
    }
  });

  it("is zero for non-finite input", () => {
    expect(writeBobbingAt(NaN, 0, false, createBobbingOut())).toEqual({ offsetY: 0, pitchRad: 0, rollRad: 0 });
    expect(writeBobbingAt(T0, Infinity, false, createBobbingOut())).toEqual({ offsetY: 0, pitchRad: 0, rollRad: 0 });
  });

  it("stays within its amplitudes and actually moves", () => {
    const out = createBobbingOut();
    let moved = false;
    for (let k = 0; k < 500; k++) {
      writeBobbingAt(T0 + k * 37, 0.7, false, out);
      expect(Math.abs(out.offsetY)).toBeLessThanOrEqual(RIVER_BOB_HEAVE_AMPLITUDE);
      expect(Math.abs(out.pitchRad)).toBeLessThanOrEqual(RIVER_BOB_PITCH_AMPLITUDE_RAD);
      expect(Math.abs(out.rollRad)).toBeLessThanOrEqual(RIVER_BOB_ROLL_AMPLITUDE_RAD);
      if (out.offsetY !== 0) moved = true;
    }
    expect(moved).toBe(true);
  });

  it("is periodic per axis", () => {
    const a = writeBobbingAt(T0 + 500, 0.4, false, createBobbingOut());
    const heave = writeBobbingAt(T0 + 500 + RIVER_BOB_HEAVE_PERIOD_MS, 0.4, false, createBobbingOut());
    const pitch = writeBobbingAt(T0 + 500 + RIVER_BOB_PITCH_PERIOD_MS, 0.4, false, createBobbingOut());
    const roll = writeBobbingAt(T0 + 500 + RIVER_BOB_ROLL_PERIOD_MS, 0.4, false, createBobbingOut());
    expect(heave.offsetY).toBeCloseTo(a.offsetY, 12);
    expect(pitch.pitchRad).toBeCloseTo(a.pitchRad, 12);
    expect(roll.rollRad).toBeCloseTo(a.rollRad, 12);
  });

  it("is deterministic and returns out", () => {
    const out = createBobbingOut();
    const first = { ...writeBobbingAt(T0 + 77, 2, false, out) };
    expect(writeBobbingAt(T0 + 77, 2, false, out)).toBe(out);
    expect(Object.is(out.offsetY, first.offsetY)).toBe(true);
    expect(Object.is(out.pitchRad, first.pitchRad)).toBe(true);
    expect(Object.is(out.rollRad, first.rollRad)).toBe(true);
    const x = writeBobbingAt(T0, 0, false, createBobbingOut()).offsetY;
    const y = writeBobbingAt(T0 + RIVER_BOB_HEAVE_PERIOD_MS / 4, 0, false, createBobbingOut()).offsetY;
    expect(x).not.toBe(y);
  });
});

describe("bobbingPhaseFromId", () => {
  it("matches FNV-1a 32-bit vectors", () => {
    expect(bobbingPhaseFromId("")).toBe((0x811c9dc5 / 2 ** 32) * TWO_PI);
    expect(bobbingPhaseFromId("a")).toBe((0xe40c292c / 2 ** 32) * TWO_PI);
    expect(bobbingPhaseFromId("foobar")).toBe((0xbf9cf968 / 2 ** 32) * TWO_PI);
  });

  it("stays in [0, 2π) and is stable per id", () => {
    for (const id of ["a", "b", "creation-1", "ครั้ง"]) {
      const p = bobbingPhaseFromId(id);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(TWO_PI);
      expect(bobbingPhaseFromId(id)).toBe(p);
    }
    expect(bobbingPhaseFromId("a")).not.toBe(bobbingPhaseFromId("b"));
  });
});
