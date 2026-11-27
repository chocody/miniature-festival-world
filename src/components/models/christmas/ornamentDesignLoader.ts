"use client";

import { ornamentDesignUrl, type OrnamentLod } from "@/config/ornamentModels.config";
import type { OrnamentDesignId } from "@/config/ornamentDesigns.config";
import { parseOrnamentDesignGlb, type OrnamentDesignMeshData } from "@/core/customization/ornamentDesignGlb";
import { createDesignGlbLoader, type ModelLoadStatus } from "../designGlbLoader";

/**
 * Lazy loader of the owner-made Christmas ornament GLBs (MFW-101): its own instance of the shared design GLB loader, so its
 * status is independent of the krathong loader. One fetch per URL per session, no retry, never logs.
 */
export type OrnamentDesignLoad = (design: OrnamentDesignId, lod: OrnamentLod) => Promise<OrnamentDesignMeshData>;

const loader = createDesignGlbLoader(parseOrnamentDesignGlb, "ornament model");

export const loadOrnamentDesign: OrnamentDesignLoad = (design, lod) => loader.load(ornamentDesignUrl(design, lod));

export function getOrnamentModelLoadStatus(): ModelLoadStatus {
  return loader.getStatus();
}

export function subscribeOrnamentModelLoads(listener: () => void): () => void {
  return loader.subscribe(listener);
}

export function resetOrnamentDesignLoaderForTests(): void {
  loader.reset();
}
