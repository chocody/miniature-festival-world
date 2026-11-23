import { describe, expect, it, vi } from "vitest";
import { createFpsAccumulator, createFpsMeter } from "./fpsMeter";
import { fakeScheduler, runFrames } from "./testFakes";

function collect(fps: number, fromMs: number, toMs: number, acc = createFpsAccumulator()) {
  const out: (ReturnType<typeof acc.frame>)[] = [];
  for (let t = fromMs; t <= toMs; t += 1000 / fps) out.push(acc.frame(t));
  return out;
}

describe("createFpsAccumulator", () => {
  it("emits nothing during warm-up, then one sample at 60 fps", () => {
    const acc = createFpsAccumulator();
    expect(collect(60, 0, 1990, acc).every((r) => r === null)).toBe(true);
    const samples = collect(60, 1990 + 1000 / 60, 3040, acc).filter((r) => r !== null);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.fps).toBeCloseTo(60, 0);
    expect(samples[0]!.startMs).toBeGreaterThanOrEqual(2000);
    expect(samples[0]!.startMs).toBeLessThan(2020);
    expect(samples[0]!.endMs - samples[0]!.startMs).toBeGreaterThanOrEqual(1000);
  });
  it("measures 15 fps", () => {
    const samples = collect(15, 0, 6000).filter((r) => r !== null);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) expect(s!.fps).toBeCloseTo(15, 0);
  });
  it("is within 0.5 of 60 for every window", () => {
    const samples = collect(60, 0, 10_000).filter((r) => r !== null);
    expect(samples.length).toBeGreaterThanOrEqual(7);
    for (const s of samples) expect(Math.abs(s!.fps - 60)).toBeLessThan(0.5);
  });
  it("a long gap is a stall: no sample, warm-up re-armed, then samples resume", () => {
    const onStall = vi.fn();
    const acc = createFpsAccumulator({ onStall });
    expect(collect(60, 0, 4000, acc).filter((r) => r !== null).length).toBeGreaterThan(0);
    expect(acc.frame(12_000)).toBeNull();
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(collect(60, 12_000 + 1000 / 60, 13_990, acc).every((r) => r === null)).toBe(true);
    expect(collect(60, 14_000, 15_100, acc).filter((r) => r !== null).length).toBeGreaterThan(0);
  });
  it("reset() restarts the warm-up", () => {
    const acc = createFpsAccumulator();
    collect(60, 0, 4000, acc);
    acc.reset();
    expect(collect(60, 4000, 5990, acc).every((r) => r === null)).toBe(true);
  });
  it("a backwards timestamp is a fresh start", () => {
    const acc = createFpsAccumulator();
    collect(60, 5000, 8000, acc);
    expect(acc.frame(100)).toBeNull();
    expect(collect(60, 116, 2000, acc).every((r) => r === null)).toBe(true);
  });
});

describe("createFpsMeter", () => {
  it("start is idempotent", () => {
    const s = fakeScheduler();
    const m = createFpsMeter(s, vi.fn());
    m.start();
    expect(s.pending).toBe(1);
    m.start();
    expect(s.pending).toBe(1);
    expect(m.running).toBe(true);
  });
  it("calls onSample after warm-up plus a window", () => {
    const s = fakeScheduler();
    const onSample = vi.fn();
    createFpsMeter(s, onSample).start();
    runFrames(s, 0, 1990, 60);
    expect(onSample).not.toHaveBeenCalled();
    runFrames(s, 2000, 3100, 60);
    expect(onSample).toHaveBeenCalled();
  });
  it("stop cancels and silences", () => {
    const s = fakeScheduler();
    const onSample = vi.fn();
    const m = createFpsMeter(s, onSample);
    m.start();
    m.stop();
    expect(s.pending).toBe(0);
    expect(m.running).toBe(false);
    runFrames(s, 0, 5000, 60);
    expect(onSample).not.toHaveBeenCalled();
  });
  it("stop inside onSample leaves nothing pending", () => {
    const s = fakeScheduler();
    const m = createFpsMeter(s, () => m.stop());
    m.start();
    runFrames(s, 0, 4000, 60);
    expect(s.pending).toBe(0);
    expect(m.running).toBe(false);
  });
  it("restart after stop re-warms-up", () => {
    const s = fakeScheduler();
    const onSample = vi.fn();
    const m = createFpsMeter(s, onSample);
    m.start();
    runFrames(s, 0, 4000, 60);
    m.stop();
    onSample.mockClear();
    m.start();
    runFrames(s, 10_000, 11_990, 60);
    expect(onSample).not.toHaveBeenCalled();
    runFrames(s, 12_000, 13_100, 60);
    expect(onSample).toHaveBeenCalled();
  });
});
