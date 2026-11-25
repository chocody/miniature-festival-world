// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createIdleRedrawTicker, type IdleRedrawEnv } from "./idleRedraw";

/** Fake timers + a controllable visibility state. */
function fakeEnv() {
  let nextId = 1;
  const timers = new Map<number, { handler: () => void; ms: number }>();
  let hidden = false;
  const listeners = new Set<() => void>();
  const env: IdleRedrawEnv = {
    setInterval: vi.fn((handler: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { handler, ms });
      return id;
    }),
    clearInterval: vi.fn((id: number) => {
      timers.delete(id);
    }),
    isHidden: () => hidden,
    onVisibilityChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    env,
    timers,
    listeners,
    tick: () => [...timers.values()].forEach((t) => t.handler()),
    setHidden(value: boolean) {
      hidden = value;
      listeners.forEach((l) => l());
    },
  };
}

describe("shared idle-redraw ticker (MFW-50 fix round)", () => {
  it("no timer when nobody is registered", () => {
    const f = fakeEnv();
    const ticker = createIdleRedrawTicker(vi.fn(), f.env);
    expect(ticker.activeIntervalMs()).toBeNull();
    expect(f.env.setInterval).not.toHaveBeenCalled();
  });

  it("two consumers share ONE interval at the smaller period, and invalidate once per tick", () => {
    const f = fakeEnv();
    const invalidate = vi.fn();
    const ticker = createIdleRedrawTicker(invalidate, f.env);
    const flame = ticker.register(125);
    const living = ticker.register(67);
    expect(f.timers.size).toBe(1);
    expect([...f.timers.values()][0].ms).toBe(67);
    expect(ticker.activeIntervalMs()).toBe(67);
    f.tick();
    expect(invalidate).toHaveBeenCalledTimes(1);
    living(); // the living world leaves (e.g. CUSTOMIZE): back to the flame cadence, still one timer
    expect(f.timers.size).toBe(1);
    expect([...f.timers.values()][0].ms).toBe(125);
    flame();
    expect(f.timers.size).toBe(0);
    expect(ticker.activeIntervalMs()).toBeNull();
    expect(f.listeners.size).toBe(0); // cleanup: no visibility listener left
  });

  it("an equal or larger registration does not re-arm the timer", () => {
    const f = fakeEnv();
    const ticker = createIdleRedrawTicker(vi.fn(), f.env);
    ticker.register(100);
    ticker.register(100);
    ticker.register(150);
    expect(f.env.setInterval).toHaveBeenCalledTimes(1);
  });

  it("a hidden tab gets no invalidate: the timer is cleared on hidden and re-armed on visible", () => {
    const f = fakeEnv();
    const invalidate = vi.fn();
    const ticker = createIdleRedrawTicker(invalidate, f.env);
    ticker.register(100);
    f.setHidden(true);
    expect(f.timers.size).toBe(0);
    expect(ticker.activeIntervalMs()).toBeNull();
    f.tick();
    expect(invalidate).not.toHaveBeenCalled();
    f.setHidden(false);
    expect(f.timers.size).toBe(1);
    f.tick();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("registering while hidden starts no timer; a tick that races the hidden state is skipped", () => {
    const f = fakeEnv();
    const invalidate = vi.fn();
    const ticker = createIdleRedrawTicker(invalidate, f.env);
    ticker.register(100);
    const handler = [...f.timers.values()][0].handler;
    f.setHidden(true);
    handler(); // a tick already queued when the tab hid
    expect(invalidate).not.toHaveBeenCalled();
    ticker.register(50);
    expect(f.timers.size).toBe(0);
  });

  it("unregister is idempotent; invalid intervals throw", () => {
    const f = fakeEnv();
    const ticker = createIdleRedrawTicker(vi.fn(), f.env);
    const a = ticker.register(100);
    const b = ticker.register(200);
    a();
    a();
    expect(ticker.activeIntervalMs()).toBe(200);
    b();
    expect(ticker.activeIntervalMs()).toBeNull();
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => ticker.register(bad)).toThrow(RangeError);
  });
});
