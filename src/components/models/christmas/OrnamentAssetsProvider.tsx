"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { OrnamentDesignId } from "@/config/ornamentDesigns.config";
import type { OrnamentLod } from "@/config/ornamentModels.config";
import { useDeviceStore } from "@/store/useDeviceStore";
import { createOrnamentAssets, type OrnamentAssets, type OrnamentDesignAsset } from "./ornamentAssets";
import type { OrnamentDesignLoad } from "./ornamentDesignLoader";

const OrnamentAssetsContext = createContext<OrnamentAssets | null>(null);

/** Owns one OrnamentAssets per canvas and disposes it on unmount. `loadDesign`: tests inject a loader (MFW-101). */
export function OrnamentAssetsProvider({ children, loadDesign }: { children: ReactNode; loadDesign?: OrnamentDesignLoad }) {
  const [assets] = useState(() => createOrnamentAssets({ loadDesign }));
  useEffect(() => () => assets.dispose(), [assets]);
  return <OrnamentAssetsContext value={assets}>{children}</OrnamentAssetsContext>;
}

export function useOrnamentAssets(): OrnamentAssets {
  const assets = useContext(OrnamentAssetsContext);
  if (!assets) throw new Error("useOrnamentAssets must be used inside <OrnamentAssetsProvider>");
  return assets;
}

/**
 * An owner-made ornament design at one LOD, or null while it loads (or after a failed load, or without a glb source: the
 * caller shows the fallback sphere). The file is requested only once the device profiler has decided the tier (`profiled`).
 */
export function useOrnamentDesign(design: OrnamentDesignId, lod: OrnamentLod): OrnamentDesignAsset | null {
  const assets = useOrnamentAssets();
  const profiled = useDeviceStore((s) => s.profiled);
  useEffect(() => {
    if (profiled) assets.requestDesign(design, lod);
  }, [assets, profiled, design, lod]);
  const read = useCallback(() => assets.design(design, lod), [assets, design, lod]);
  return useSyncExternalStore(assets.subscribeDesigns, read, read);
}
