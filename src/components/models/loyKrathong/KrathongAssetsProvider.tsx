"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";
import type { KrathongLod } from "@/config/krathongModel.config";
import type { KrathongFlameAnchor } from "@/core/customization";
import { useDeviceStore } from "@/store/useDeviceStore";
import { createKrathongAssets, type KrathongAssets, type KrathongDesignAsset } from "./krathongAssets";
import type { KrathongDesignLoad } from "./krathongDesignLoader";

const KrathongAssetsContext = createContext<KrathongAssets | null>(null);

/** Owns one KrathongAssets per canvas and disposes it on unmount. `loadDesign`: tests inject a loader (MFW-65). */
export function KrathongAssetsProvider({ children, loadDesign }: { children: ReactNode; loadDesign?: KrathongDesignLoad }) {
  const [assets] = useState(() => createKrathongAssets({ loadDesign }));
  useEffect(() => () => assets.dispose(), [assets]);
  return <KrathongAssetsContext value={assets}>{children}</KrathongAssetsContext>;
}

export function useKrathongAssets(): KrathongAssets {
  const assets = useContext(KrathongAssetsContext);
  if (!assets) throw new Error("useKrathongAssets must be used inside <KrathongAssetsProvider>");
  return assets;
}

/** River plan input (MFW-65): the flame anchors of a loaded design, or null while it is not loaded. */
export interface KrathongDesignPlanSource {
  flames(design: KrathongDesignId): readonly KrathongFlameAnchor[] | null;
}

/**
 * MFW-65: an owner-supplied design at one LOD, or null while it loads (or after a failed load: the caller keeps the
 * procedural model). The file is requested only once the device profiler has decided the tier (`profiled`).
 */
export function useKrathongDesign(design: KrathongDesignId, lod: KrathongLod): KrathongDesignAsset | null {
  const assets = useKrathongAssets();
  const profiled = useDeviceStore((s) => s.profiled);
  useEffect(() => {
    if (profiled) assets.requestDesign(design, lod);
  }, [assets, profiled, design, lod]);
  const read = useCallback(() => assets.design(design, lod), [assets, design, lod]);
  return useSyncExternalStore(assets.subscribeDesigns, read, read);
}

/** MFW-65: requests each design once the tier is decided; the source changes identity when a design becomes available. */
export function useKrathongDesignPlanSource(designs: readonly KrathongDesignId[], lod: KrathongLod): KrathongDesignPlanSource {
  const assets = useKrathongAssets();
  const profiled = useDeviceStore((s) => s.profiled);
  const designVersion = useSyncExternalStore(assets.subscribeDesigns, assets.getDesignVersion, assets.getDesignVersion);
  useEffect(() => {
    if (!profiled) return;
    for (const design of designs) assets.requestDesign(design, lod);
  }, [assets, profiled, designs, lod]);
  return useMemo<KrathongDesignPlanSource>(() => {
    void designVersion; // a newly loaded design must produce a new source (and so a new river plan)
    return { flames: (design) => assets.design(design, lod)?.flames ?? null };
  }, [assets, lod, designVersion]);
}
