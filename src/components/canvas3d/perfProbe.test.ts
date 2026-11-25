import { afterEach, describe, expect, it } from "vitest";
import { PERF_PROBE_GLOBAL_NAME } from "@/config/perfProbe.config";
import {
  diffRendererSamples,
  isPerfProbeRequested,
  readJsHeapBytes,
  readRendererSample,
  registerPerfProbeHook,
  type RendererSample,
} from "./perfProbe";

const source = (programs: readonly unknown[] | null) => ({
  info: {
    memory: { geometries: 3, textures: 1 },
    render: { calls: 12, triangles: 400, frame: 7 },
    programs,
  },
});

describe("perfProbe", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[PERF_PROBE_GLOBAL_NAME];
  });

  it("isPerfProbeRequested matches the exact flag only", () => {
    expect(isPerfProbeRequested("?perfProbe=1")).toBe(true);
    expect(isPerfProbeRequested("?a=b&perfProbe=1")).toBe(true);
    for (const s of ["", "?perfProbe=0", "?perfprobe=1", "?perfProbe"]) expect(isPerfProbeRequested(s)).toBe(false);
  });

  it("readRendererSample maps the counters and is frozen", () => {
    expect(readRendererSample(null, 3, null)).toBeNull();
    const s = readRendererSample(source([{}, {}]), 3, 99)!;
    expect(s).toEqual({ geometries: 3, textures: 1, programs: 2, calls: 12, triangles: 400, frame: 7, riverItems: 3, jsHeapBytes: 99 });
    expect(Object.isFrozen(s)).toBe(true);
    expect(readRendererSample(source(null), 0, null)!.programs).toBe(0);
  });

  it("diffRendererSamples subtracts and nulls the heap delta when a side is missing", () => {
    const a = readRendererSample(source([{}]), 1, 100)!;
    const b: RendererSample = { ...a, geometries: 5, calls: 20, jsHeapBytes: 150 };
    const d = diffRendererSamples(a, b);
    expect(d.geometries).toBe(2);
    expect(d.calls).toBe(8);
    expect(d.jsHeapBytes).toBe(50);
    expect(diffRendererSamples(a, { ...b, jsHeapBytes: null }).jsHeapBytes).toBeNull();
    expect(diffRendererSamples({ ...a, jsHeapBytes: null }, b).jsHeapBytes).toBeNull();
  });

  it("readJsHeapBytes accepts only finite non-negative numbers", () => {
    expect(readJsHeapBytes({ memory: { usedJSHeapSize: 1234 } } as unknown as Performance)).toBe(1234);
    expect(readJsHeapBytes({} as unknown as Performance)).toBeNull();
    expect(readJsHeapBytes({ memory: { usedJSHeapSize: -1 } } as unknown as Performance)).toBeNull();
  });

  it("registerPerfProbeHook sets the hook and its cleanup never removes a newer hook", () => {
    const w = window as unknown as Record<string, unknown>;
    const first = { sample: () => null };
    const second = { sample: () => null };
    const stopFirst = registerPerfProbeHook(first);
    expect(w[PERF_PROBE_GLOBAL_NAME]).toBe(first);
    stopFirst();
    expect(w[PERF_PROBE_GLOBAL_NAME]).toBeUndefined();
    const stop1 = registerPerfProbeHook(first);
    registerPerfProbeHook(second);
    stop1();
    expect(w[PERF_PROBE_GLOBAL_NAME]).toBe(second);
  });
});
