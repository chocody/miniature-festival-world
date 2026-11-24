"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createKrathongAssets, type KrathongAssets } from "./krathongAssets";

const KrathongAssetsContext = createContext<KrathongAssets | null>(null);

/** Owns one KrathongAssets per canvas and disposes it on unmount. */
export function KrathongAssetsProvider({ children }: { children: ReactNode }) {
  const [assets] = useState(createKrathongAssets);
  useEffect(() => () => assets.dispose(), [assets]);
  return <KrathongAssetsContext value={assets}>{children}</KrathongAssetsContext>;
}

export function useKrathongAssets(): KrathongAssets {
  const assets = useContext(KrathongAssetsContext);
  if (!assets) throw new Error("useKrathongAssets must be used inside <KrathongAssetsProvider>");
  return assets;
}
