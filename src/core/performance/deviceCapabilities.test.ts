import { describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  detectDeviceCapabilities,
  detectWebGL,
  readPositiveNumber,
  readReducedMotion,
  subscribeReducedMotion,
} from "./deviceCapabilities";
import { fakeCanvas, fakeMql } from "./testFakes";

describe("readPositiveNumber", () => {
  it("keeps finite positive numbers", () => {
    expect(readPositiveNumber(8)).toBe(8);
    expect(readPositiveNumber(0.5)).toBe(0.5);
  });
  it.each([undefined, 0, -1, NaN, Infinity, "8", null])("returns null for %s", (v) => {
    expect(readPositiveNumber(v)).toBeNull();
  });
});

describe("detectWebGL", () => {
  it("true with webgl2 and releases the context", () => {
    const f = fakeCanvas({ webgl2: true });
    expect(detectWebGL(() => f.canvas)).toBe(true);
    expect(f.loseContext).toHaveBeenCalledTimes(1);
    expect(f.requested).toEqual(["webgl2"]);
  });
  it("falls back to webgl", () => {
    const f = fakeCanvas({ webgl: true });
    expect(detectWebGL(() => f.canvas)).toBe(true);
    expect(f.requested).toEqual(["webgl2", "webgl"]);
    expect(f.loseContext).toHaveBeenCalledTimes(1);
  });
  it("false when both are null", () => {
    expect(detectWebGL(() => fakeCanvas({}).canvas)).toBe(false);
  });
  it("false when getContext throws", () => {
    expect(detectWebGL(() => fakeCanvas({ throws: true }).canvas)).toBe(false);
  });
  it("false when createCanvas throws", () => {
    expect(
      detectWebGL(() => {
        throw new Error("no canvas");
      }),
    ).toBe(false);
  });
  it("false without createCanvas", () => {
    expect(detectWebGL(undefined)).toBe(false);
  });
});

describe("readReducedMotion", () => {
  it("false without matchMedia", () => {
    expect(readReducedMotion(undefined)).toBe(false);
  });
  it("reads matches using the reduced-motion query", () => {
    const mm = vi.fn(() => fakeMql(true));
    expect(readReducedMotion(mm)).toBe(true);
    expect(mm).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });
  it("false when matchMedia throws", () => {
    expect(
      readReducedMotion(() => {
        throw new Error("x");
      }),
    ).toBe(false);
  });
});

describe("subscribeReducedMotion", () => {
  it("notifies on change and stops after unsubscribe", () => {
    const mql = fakeMql(false);
    const cb = vi.fn();
    const off = subscribeReducedMotion(() => mql, cb);
    mql.emit(true);
    expect(cb).toHaveBeenCalledWith(true);
    off();
    mql.emit(false);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(mql.listeners.size).toBe(0);
  });
  it("supports the legacy addListener API", () => {
    const mql = fakeMql(false, { legacy: true });
    const cb = vi.fn();
    const off = subscribeReducedMotion(() => mql, cb);
    mql.emit(true);
    expect(cb).toHaveBeenCalledWith(true);
    off();
    expect(mql.listeners.size).toBe(0);
    mql.emit(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("is a no-op without matchMedia", () => {
    const off = subscribeReducedMotion(undefined, vi.fn());
    expect(() => off()).not.toThrow();
  });
});

describe("detectDeviceCapabilities", () => {
  it("empty env gives the neutral result", () => {
    expect(detectDeviceCapabilities({})).toEqual({
      webgl: false,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      reducedMotion: false,
    });
  });
  it("combines all sources", () => {
    expect(
      detectDeviceCapabilities({
        navigator: { deviceMemory: 4, hardwareConcurrency: 6 },
        createCanvas: () => fakeCanvas({ webgl2: true }).canvas,
        matchMedia: () => fakeMql(true),
      }),
    ).toEqual({ webgl: true, deviceMemoryGb: 4, hardwareConcurrency: 6, reducedMotion: true });
  });
  it("treats invalid hints as unknown", () => {
    const caps = detectDeviceCapabilities({ navigator: { deviceMemory: "8", hardwareConcurrency: 0 } });
    expect(caps.deviceMemoryGb).toBeNull();
    expect(caps.hardwareConcurrency).toBeNull();
  });
});
