"use client";

import { useSyncExternalStore } from "react";
import { krathongDesignUrl, type KrathongDesignId } from "@/config/krathongDesigns.config";
import type { KrathongLod } from "@/config/krathongModel.config";
import { parseKrathongDesignGlb, type KrathongDesignMeshData } from "@/core/customization/krathongDesignGlb";
import { createDesignGlbLoader, type ModelLoadStatus } from "../designGlbLoader";

/**
 * Lazy loader of the owner-supplied krathong design GLBs (MFW-65) on the shared design GLB loader. One fetch per URL per
 * session; the cache holds CPU data only, so a canvas re-created on a tier change rebuilds its GPU geometry without
 * refetching. A failed load stays failed (no retry in the session) and the procedural model keeps rendering. Never logs.
 */
export type KrathongDesignLoad = (design: KrathongDesignId, lod: KrathongLod) => Promise<KrathongDesignMeshData>;
export type KrathongModelLoadStatus = ModelLoadStatus;

const loader = createDesignGlbLoader(parseKrathongDesignGlb, "krathong model");

export const loadKrathongDesign: KrathongDesignLoad = (design, lod) => loader.load(krathongDesignUrl(design, lod));

export function getKrathongModelLoadStatus(): KrathongModelLoadStatus {
  return loader.getStatus();
}

export function subscribeKrathongModelLoads(listener: () => void): () => void {
  return loader.subscribe(listener);
}

const serverStatus = (): KrathongModelLoadStatus => "idle";

/** Aggregate status of every requested design file (the scene's data-krathong-models attribute). */
export function useKrathongModelLoadStatus(): KrathongModelLoadStatus {
  return useSyncExternalStore(subscribeKrathongModelLoads, getKrathongModelLoadStatus, serverStatus);
}

export function resetKrathongDesignLoaderForTests(): void {
  loader.reset();
}
