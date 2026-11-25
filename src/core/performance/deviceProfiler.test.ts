import { describe, expect, it, vi } from "vitest";
import { isTierPinRequested, startDeviceProfiler, type ProfilerEnv } from "./deviceProfiler";
import { fakeCanvas, fakeDoc, fakeMql, fakeScheduler, runFrames } from "./testFakes";

function setup(
  o: {
    webgl?: boolean;
    memory?: number;
    cores?: number;
    reduced?: boolean;
    visibility?: DocumentVisibilityState;
    noScheduler?: boolean;
  } = {},
) {
  const sched = fakeScheduler();
  const mql = fakeMql(o.reduced ?? false);
  const doc = fakeDoc(o.visibility ?? "visible");
  const sink = { setFps: vi.fn(), setQualityTier: vi.fn(), setReducedMotion: vi.fn() };
  const env: ProfilerEnv = {
    navigator: { deviceMemory: o.memory, hardwareConcurrency: o.cores },
    createCanvas: () => fakeCanvas({ webgl2: o.webgl ?? true }).canvas,
    matchMedia: () => mql,
    scheduler: o.noScheduler ? undefined : sched,
    document: doc,
  };
  return { sched, mql, doc, sink, env };
}

describe("tier pin (?pinTier=1)", () => {
  it("matches only the exact flag", () => {
    expect(isTierPinRequested("?pinTier=1")).toBe(true);
    expect(isTierPinRequested("?perfProbe=1&pinTier=1")).toBe(true);
    for (const s of ["", "?pinTier=0", "?pinTier=true", "?PinTier=1", "?pintier=1"]) expect(isTierPinRequested(s)).toBe(false);
  });

  it("watchFps false keeps the initial tier: no meter, no step-down, no 2D fallback", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env, { watchFps: false });
    expect(sink.setQualityTier).toHaveBeenCalledTimes(1);
    expect(sink.setQualityTier).toHaveBeenCalledWith("HIGH");
    expect(sched.pending).toBe(0);
    runFrames(sched, 0, 12_000, 5);
    expect(sink.setQualityTier).toHaveBeenCalledTimes(1);
    expect(sink.setFps).not.toHaveBeenCalled();
  });

  it("watchFps false still honours no WebGL and reduced motion", () => {
    const { mql, sink, env } = setup({ webgl: false, reduced: true });
    startDeviceProfiler(sink, env, { watchFps: false });
    expect(sink.setQualityTier).toHaveBeenCalledWith("FALLBACK_2D");
    expect(sink.setReducedMotion).toHaveBeenCalledWith(true);
    mql.emit(false);
    expect(sink.setReducedMotion).toHaveBeenLastCalledWith(false);
  });
});

describe("startDeviceProfiler", () => {
  it("no WebGL -> FALLBACK_2D, meter never starts", () => {
    const { sched, sink, env } = setup({ webgl: false, memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    expect(sink.setQualityTier).toHaveBeenCalledTimes(1);
    expect(sink.setQualityTier).toHaveBeenCalledWith("FALLBACK_2D");
    expect(sched.pending).toBe(0);
  });

  it("strong hints -> HIGH and meter pending", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    expect(sink.setQualityTier).toHaveBeenCalledWith("HIGH");
    expect(sched.pending).toBe(1);
  });

  it("reduced motion is read and tracked", () => {
    const { mql, sink, env } = setup({ reduced: true });
    startDeviceProfiler(sink, env);
    expect(sink.setReducedMotion).toHaveBeenCalledWith(true);
    mql.emit(false);
    expect(sink.setReducedMotion).toHaveBeenLastCalledWith(false);
  });

  it("publishes fps samples", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 4000, 60);
    expect(sink.setFps).toHaveBeenCalled();
    const v = sink.setFps.mock.calls[0]![0] as number;
    expect(v).toBeGreaterThan(59);
    expect(v).toBeLessThan(61);
  });

  it("HIGH at 30 fps steps down to MEDIUM after warm-up + 5 windows", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 6990, 30);
    expect(sink.setQualityTier).not.toHaveBeenCalledWith("MEDIUM");
    runFrames(sched, 7000, 8500, 30);
    expect(sink.setQualityTier).toHaveBeenCalledWith("MEDIUM");
  });

  it("10 fps on LOW -> FALLBACK_2D, meter stops, visibility no longer restarts it", () => {
    const { sched, doc, sink, env } = setup({ memory: 2, cores: 8 });
    startDeviceProfiler(sink, env);
    expect(sink.setQualityTier).toHaveBeenCalledWith("LOW");
    runFrames(sched, 0, 10_000, 10);
    expect(sink.setQualityTier).toHaveBeenLastCalledWith("FALLBACK_2D");
    expect(sched.pending).toBe(0);
    expect(doc.listeners.size).toBe(0);
    doc.set("visible");
    expect(sched.pending).toBe(0);
  });

  it("pauses when hidden and re-warms-up when visible", () => {
    const { sched, doc, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    doc.set("hidden");
    expect(sched.pending).toBe(0);
    doc.set("visible");
    expect(sched.pending).toBe(1);
    runFrames(sched, 50_000, 51_990, 60);
    expect(sink.setFps).not.toHaveBeenCalled();
    runFrames(sched, 52_000, 53_100, 60);
    expect(sink.setFps).toHaveBeenCalled();
  });

  it("does not start the meter while hidden at start", () => {
    const { sched, doc, sink, env } = setup({ visibility: "hidden" });
    startDeviceProfiler(sink, env);
    expect(sched.pending).toBe(0);
    doc.set("visible");
    expect(sched.pending).toBe(1);
  });

  it("works without a scheduler", () => {
    const { sink, env } = setup({ noScheduler: true, memory: 8, cores: 8 });
    expect(() => startDeviceProfiler(sink, env)).not.toThrow();
    expect(sink.setQualityTier).toHaveBeenCalledWith("HIGH");
  });

  it("cleanup removes everything and is safe twice", () => {
    const { sched, mql, doc, sink, env } = setup({ memory: 8, cores: 8 });
    const stop = startDeviceProfiler(sink, env);
    expect(mql.listeners.size).toBe(1);
    expect(doc.listeners.size).toBe(1);
    stop();
    expect(sched.pending).toBe(0);
    expect(mql.listeners.size).toBe(0);
    expect(doc.listeners.size).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it("a single long stall does not trigger a step-down or fallback", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 6000, 60);
    sched.tick(12_000); // 6 s freeze
    sink.setFps.mockClear();
    runFrames(sched, 12_017, 14_000, 60);
    expect(sink.setFps).not.toHaveBeenCalled(); // warm-up re-armed, discarded window not published
    runFrames(sched, 14_017, 30_000, 60);
    expect(sink.setQualityTier).toHaveBeenCalledTimes(1);
    expect(sink.setQualityTier).toHaveBeenCalledWith("HIGH");
  });

  it("a stall resets a partial low-fps streak", () => {
    const { sched, sink, env } = setup({ memory: 8, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 5990, 30); // 2 s warm-up + ~4 low windows
    sched.tick(9000);
    runFrames(sched, 9033, 30_000, 60);
    expect(sink.setQualityTier).toHaveBeenCalledTimes(1);
  });

  it("genuine 10 fps (100 ms gaps) still falls back at the same time", () => {
    const { sched, sink, env } = setup({ memory: 2, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 6990, 10);
    expect(sink.setQualityTier).not.toHaveBeenCalledWith("FALLBACK_2D");
    runFrames(sched, 7000, 8000, 10);
    expect(sink.setQualityTier).toHaveBeenLastCalledWith("FALLBACK_2D");
  });

  it("~1.5 fps (667 ms gaps) is low FPS, not a stall, and falls back", () => {
    const { sched, sink, env } = setup({ memory: 2, cores: 8 });
    startDeviceProfiler(sink, env);
    runFrames(sched, 0, 20_000, 1.5);
    expect(sink.setQualityTier).toHaveBeenLastCalledWith("FALLBACK_2D");
  });
});
