"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * ONE idle-redraw source per canvas (MFW-50 fix round, lead decision): the demand loop renders only when invalidated, and a
 * still scene with small motion (the MFW-48 flame flicker, the MFW-50 living world in the shared world view) needs a slow,
 * capped redraw. Consumers register the interval they want; a single timer runs at the smallest registered interval and calls
 * invalidate() once per tick. No timer while nobody is registered, and none while the tab is hidden (cleared on "hidden",
 * re-armed on "visible"), so a background tab never renders.
 */

export interface IdleRedrawEnv {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): () => void;
}

export interface IdleRedrawTicker {
  /** Registers one consumer at `intervalMs` (finite > 0); returns its unregister function (idempotent). */
  register(intervalMs: number): () => void;
  /** The interval the timer runs at, or null when no timer runs (nobody registered, or the tab is hidden). */
  activeIntervalMs(): number | null;
}

export function createIdleRedrawTicker(invalidate: () => void, env: IdleRedrawEnv): IdleRedrawTicker {
  const registrations = new Map<number, number>(); // token → interval
  let nextToken = 0;
  let timer: number | null = null;
  let timerMs: number | null = null;
  let stopListening: (() => void) | null = null;

  const stopTimer = () => {
    if (timer !== null) env.clearInterval(timer);
    timer = null;
    timerMs = null;
  };
  const sync = () => {
    const wanted = registrations.size === 0 || env.isHidden() ? null : Math.min(...registrations.values());
    if (wanted === timerMs) return;
    stopTimer();
    if (wanted === null) return;
    timerMs = wanted;
    timer = env.setInterval(() => {
      if (!env.isHidden()) invalidate();
    }, wanted);
  };

  return {
    register(intervalMs) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError("idle redraw interval must be finite and > 0");
      const token = nextToken++;
      registrations.set(token, intervalMs);
      stopListening ??= env.onVisibilityChange(sync);
      sync();
      return () => {
        if (!registrations.delete(token)) return;
        if (registrations.size === 0 && stopListening) {
          stopListening();
          stopListening = null;
        }
        sync();
      };
    },
    activeIntervalMs: () => timerMs,
  };
}

const BROWSER_ENV: IdleRedrawEnv = {
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (id) => window.clearInterval(id),
  isHidden: () => document.hidden,
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/** One ticker per canvas: R3F's invalidate is per root. */
const tickers = new WeakMap<() => void, IdleRedrawTicker>();

export function idleRedrawTickerFor(invalidate: () => void): IdleRedrawTicker {
  let ticker = tickers.get(invalidate);
  if (!ticker) {
    ticker = createIdleRedrawTicker(invalidate, BROWSER_ENV);
    tickers.set(invalidate, ticker);
  }
  return ticker;
}

/** Registers `intervalMs` with this canvas's idle-redraw ticker while mounted; null = no registration. */
export function useIdleRedraw(intervalMs: number | null): void {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (intervalMs === null) return;
    return idleRedrawTickerFor(invalidate).register(intervalMs);
  }, [intervalMs, invalidate]);
}
