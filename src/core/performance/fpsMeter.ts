import { FPS_SAMPLE_WINDOW_MS, FPS_STALL_GAP_MS, FPS_WARMUP_MS } from "@/config/performance.config";

export interface FpsSample {
  fps: number;
  startMs: number;
  endMs: number;
}
export interface FpsAccumulatorOptions {
  warmupMs?: number;
  windowMs?: number;
  /** A gap between frames longer than this is a stall: the window is discarded and warm-up re-armed. */
  stallGapMs?: number;
  /** Called when a stall was detected (the discarded window produces no sample). */
  onStall?: () => void;
}
export interface FpsAccumulator {
  frame(timestampMs: number): FpsSample | null;
  reset(): void;
}

/** Pure FPS accumulator: ignores the warm-up, then emits one sample per back-to-back window. */
export function createFpsAccumulator(opts: FpsAccumulatorOptions = {}): FpsAccumulator {
  const warmupMs = opts.warmupMs ?? FPS_WARMUP_MS;
  const windowMs = opts.windowMs ?? FPS_SAMPLE_WINDOW_MS;
  const stallGapMs = opts.stallGapMs ?? FPS_STALL_GAP_MS;
  let warmupEndMs: number | null = null;
  let windowStartMs: number | null = null;
  let frames = 0;
  let lastMs: number | null = null;

  function reset() {
    warmupEndMs = null;
    windowStartMs = null;
    frames = 0;
    lastMs = null;
  }

  function frame(t: number): FpsSample | null {
    if (lastMs !== null && t < lastMs) reset();
    if (lastMs !== null && t - lastMs > stallGapMs) {
      reset();
      opts.onStall?.();
    }
    lastMs = t;
    if (warmupEndMs === null) {
      warmupEndMs = t + warmupMs;
      return null;
    }
    if (t < warmupEndMs) return null;
    if (windowStartMs === null) {
      windowStartMs = t;
      frames = 0;
      return null;
    }
    frames += 1;
    const elapsed = t - windowStartMs;
    if (elapsed >= windowMs) {
      // 1000 converts ms to seconds.
      const sample: FpsSample = { fps: (frames * 1000) / elapsed, startMs: windowStartMs, endMs: t };
      windowStartMs = t;
      frames = 0;
      return sample;
    }
    return null;
  }

  return { frame, reset };
}

export interface FrameScheduler {
  request(cb: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}
export interface FpsMeter {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createFpsMeter(
  scheduler: FrameScheduler,
  onSample: (s: FpsSample) => void,
  opts?: FpsAccumulatorOptions,
): FpsMeter {
  const acc = createFpsAccumulator(opts);
  let running = false;
  let handle: number | null = null;

  function loop(t: number) {
    if (!running) return;
    const s = acc.frame(t);
    handle = scheduler.request(loop);
    if (s) onSample(s); // onSample may call stop()
  }

  return {
    start() {
      if (running) return;
      acc.reset();
      running = true;
      handle = scheduler.request(loop);
    },
    stop() {
      running = false;
      if (handle !== null) {
        scheduler.cancel(handle);
        handle = null;
      }
    },
    get running() {
      return running;
    },
  };
}
