import { PERF_PROBE_GLOBAL_NAME, PERF_PROBE_QUERY_PARAM, PERF_PROBE_QUERY_VALUE } from "@/config/perfProbe.config";

/** Structural subset of THREE.WebGLRenderer the probe reads (WebGLRenderer satisfies it). */
export interface RendererInfoSource {
  readonly info: {
    readonly memory: { readonly geometries: number; readonly textures: number };
    readonly render: { readonly calls: number; readonly triangles: number; readonly frame: number };
    readonly programs: readonly unknown[] | null;
  };
}

/** Counters only: no creation data, no positions (invariants A, C). */
export interface RendererSample {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly calls: number; // last rendered frame, all passes (shadow pass included)
  readonly triangles: number; // last rendered frame
  readonly frame: number;
  readonly riverItems: number; // items handed to RiverFlow (before the tier cap)
  readonly jsHeapBytes: number | null; // performance.memory (Chromium only), else null
}

export type RendererSampleDelta = {
  readonly [K in Exclude<keyof RendererSample, "jsHeapBytes">]: number;
} & { readonly jsHeapBytes: number | null };

export interface PerfProbeHook {
  sample(): RendererSample | null;
}

/** Exact, case-sensitive match of the query flag. */
export function isPerfProbeRequested(search: string): boolean {
  return new URLSearchParams(search).get(PERF_PROBE_QUERY_PARAM) === PERF_PROBE_QUERY_VALUE;
}

export function readPerfProbeFlag(): boolean {
  return typeof window !== "undefined" && isPerfProbeRequested(window.location.search);
}

export function readPerfProbeFlagOnServer(): boolean {
  return false;
}

/** The URL never changes in this SPA flow, so there is nothing to subscribe to. */
export function subscribeToNothing(): () => void {
  return () => {};
}

export function readJsHeapBytes(perf: Performance | undefined = globalThis.performance): number | null {
  if (perf === undefined) return null;
  const used = (perf as Performance & { memory?: { usedJSHeapSize?: unknown } }).memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) && used >= 0 ? used : null;
}

export function readRendererSample(
  source: RendererInfoSource | null,
  riverItems: number,
  jsHeapBytes: number | null,
): RendererSample | null {
  if (source === null) return null;
  const { info } = source;
  return Object.freeze({
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    calls: info.render.calls,
    triangles: info.render.triangles,
    frame: info.render.frame,
    riverItems,
    jsHeapBytes,
  });
}

export function diffRendererSamples(before: RendererSample, after: RendererSample): RendererSampleDelta {
  return Object.freeze({
    geometries: after.geometries - before.geometries,
    textures: after.textures - before.textures,
    programs: after.programs - before.programs,
    calls: after.calls - before.calls,
    triangles: after.triangles - before.triangles,
    frame: after.frame - before.frame,
    riverItems: after.riverItems - before.riverItems,
    jsHeapBytes: before.jsHeapBytes !== null && after.jsHeapBytes !== null ? after.jsHeapBytes - before.jsHeapBytes : null,
  });
}

/** Sets the automation hook; the cleanup removes it only if it still holds this hook. */
export function registerPerfProbeHook(hook: PerfProbeHook, target: Window = window): () => void {
  const store = target as unknown as Record<string, PerfProbeHook | undefined>;
  store[PERF_PROBE_GLOBAL_NAME] = hook;
  return () => {
    if (store[PERF_PROBE_GLOBAL_NAME] === hook) delete store[PERF_PROBE_GLOBAL_NAME];
  };
}
