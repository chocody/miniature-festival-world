"use client";

import { useSyncExternalStore } from "react";
import { krathongDesignUrl, type KrathongDesignId } from "@/config/krathongDesigns.config";
import type { KrathongLod } from "@/config/krathongModel.config";
import { parseKrathongDesignGlb, type KrathongDesignMeshData } from "@/core/customization/krathongDesignGlb";

/**
 * Lazy loader of the owner-supplied krathong design GLBs (MFW-65). One fetch per URL per session; the cache holds CPU data
 * only, so a canvas re-created on a tier change rebuilds its GPU geometry without refetching. A failed load stays failed
 * (no retry in the session) and the procedural model keeps rendering. Never logs.
 */
export type KrathongDesignLoad = (design: KrathongDesignId, lod: KrathongLod) => Promise<KrathongDesignMeshData>;
export type KrathongModelLoadStatus = "idle" | "loading" | "ready" | "failed";

type EntryState = "loading" | "ready" | "failed";
const cache = new Map<string, Promise<KrathongDesignMeshData>>();
const states = new Map<string, EntryState>();
const listeners = new Set<() => void>();
let status: KrathongModelLoadStatus = "idle";

function aggregate(): KrathongModelLoadStatus {
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

async function fetchDesign(url: string): Promise<KrathongDesignMeshData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`krathong model ${url}: HTTP ${response.status}`);
  return parseKrathongDesignGlb(await response.arrayBuffer());
}

export const loadKrathongDesign: KrathongDesignLoad = (design, lod) => {
  const url = krathongDesignUrl(design, lod);
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
};

export function getKrathongModelLoadStatus(): KrathongModelLoadStatus {
  return status;
}

export function subscribeKrathongModelLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverStatus = (): KrathongModelLoadStatus => "idle";

/** Aggregate status of every requested design file (the scene's data-krathong-models attribute). */
export function useKrathongModelLoadStatus(): KrathongModelLoadStatus {
  return useSyncExternalStore(subscribeKrathongModelLoads, getKrathongModelLoadStatus, serverStatus);
}

export function resetKrathongDesignLoaderForTests(): void {
  cache.clear();
  states.clear();
  listeners.clear();
  status = "idle";
}
