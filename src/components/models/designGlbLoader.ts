"use client";

/**
 * Generic lazy loader of design GLBs (krathong MFW-65, Christmas ornaments MFW-101). One fetch per URL per session; the
 * cache holds CPU data only, so a canvas re-created on a tier change rebuilds its GPU geometry without refetching. A failed
 * load stays failed (no retry in the session). Never logs. Each pack owns its own instance (independent status).
 */
export type ModelLoadStatus = "idle" | "loading" | "ready" | "failed";

export interface DesignGlbLoader<T> {
  /** Same promise for the same URL, every call. */
  load(url: string): Promise<T>;
  /** Aggregate status of every requested URL: loading while any loads, else failed when any failed, else ready. */
  getStatus(): ModelLoadStatus;
  subscribe(listener: () => void): () => void;
  /** Tests: forgets every URL, state and listener. */
  reset(): void;
}

type EntryState = "loading" | "ready" | "failed";

export function createDesignGlbLoader<T>(parse: (buffer: ArrayBuffer) => T, label: string): DesignGlbLoader<T> {
  const cache = new Map<string, Promise<T>>();
  const states = new Map<string, EntryState>();
  const listeners = new Set<() => void>();
  let status: ModelLoadStatus = "idle";

  function aggregate(): ModelLoadStatus {
    if (states.size === 0) return "idle";
    let failed = false;
    for (const state of states.values()) {
      if (state === "loading") return "loading";
      if (state === "failed") failed = true;
    }
    return failed ? "failed" : "ready";
  }

  function setState(url: string, state: EntryState): void {
    states.set(url, state);
    const next = aggregate();
    if (next === status) return;
    status = next;
    for (const listener of [...listeners]) listener();
  }

  async function fetchDesign(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} ${url}: HTTP ${response.status}`);
    return parse(await response.arrayBuffer());
  }

  return {
    load(url) {
      const cached = cache.get(url);
      if (cached !== undefined) return cached;
      const promise = fetchDesign(url);
      cache.set(url, promise);
      setState(url, "loading");
      promise.then(
        () => setState(url, "ready"),
        () => setState(url, "failed"),
      );
      return promise;
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      cache.clear();
      states.clear();
      listeners.clear();
      status = "idle";
    },
  };
}
