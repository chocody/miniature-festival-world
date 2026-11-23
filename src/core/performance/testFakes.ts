// Test-only helpers. Import from *.test.ts(x) files only.
import { vi } from "vitest";
import type { FrameScheduler } from "./fpsMeter";
import type { MediaQueryListLike } from "./deviceCapabilities";

export interface FakeScheduler extends FrameScheduler {
  tick(t: number): void;
  readonly pending: number;
}

export function fakeScheduler(): FakeScheduler {
  const cbs = new Map<number, (t: number) => void>();
  let id = 0;
  return {
    request(cb) {
      id += 1;
      cbs.set(id, cb);
      return id;
    },
    cancel(h) {
      cbs.delete(h);
    },
    tick(t) {
      const copy = [...cbs.values()];
      cbs.clear();
      for (const cb of copy) cb(t);
    },
    get pending() {
      return cbs.size;
    },
  };
}

export function runFrames(s: FakeScheduler, fromMs: number, toMs: number, fps: number): void {
  for (let t = fromMs; t <= toMs; t += 1000 / fps) s.tick(t);
}

export interface FakeMql extends MediaQueryListLike {
  matches: boolean;
  readonly listeners: Set<(e: { matches: boolean }) => void>;
  emit(m: boolean): void;
}

export function fakeMql(matches: boolean, opts: { legacy?: boolean } = {}): FakeMql {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const base = {
    matches,
    listeners,
    emit(m: boolean) {
      this.matches = m;
      for (const l of [...listeners]) l({ matches: m });
    },
  };
  if (opts.legacy) {
    return Object.assign(base, {
      addListener: (l: (e: { matches: boolean }) => void) => void listeners.add(l),
      removeListener: (l: (e: { matches: boolean }) => void) => void listeners.delete(l),
    });
  }
  return Object.assign(base, {
    addEventListener: (_t: "change", l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_t: "change", l: (e: { matches: boolean }) => void) =>
      void listeners.delete(l),
  });
}

export interface FakeDoc {
  visibilityState: DocumentVisibilityState;
  readonly listeners: Set<() => void>;
  addEventListener(type: "visibilitychange", l: () => void): void;
  removeEventListener(type: "visibilitychange", l: () => void): void;
  set(state: DocumentVisibilityState): void;
}

export function fakeDoc(state: DocumentVisibilityState): FakeDoc {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state,
    listeners,
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    set(s) {
      this.visibilityState = s;
      for (const l of [...listeners]) l();
    },
  };
}

export function fakeCanvas(opts: { webgl2?: boolean; webgl?: boolean; throws?: boolean }) {
  const requested: string[] = [];
  const loseContext = vi.fn();
  const ctx = { getExtension: () => ({ loseContext }) };
  return {
    requested,
    loseContext,
    ctx,
    canvas: {
      getContext(id: string): unknown {
        requested.push(id);
        if (opts.throws) throw new Error("boom");
        if (id === "webgl2") return opts.webgl2 ? ctx : null;
        if (id === "webgl") return opts.webgl ? ctx : null;
        return null;
      },
    },
  };
}
