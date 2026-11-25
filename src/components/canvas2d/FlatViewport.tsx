"use client";

import type { InteractionMode } from "@/core/interaction";
import { useDeviceStore } from "@/store/useDeviceStore";
import { FlatKrathongPreview } from "./FlatKrathongPreview";
import { FlatRiverView } from "./FlatRiverView";

/** Mode switch of the 2D fallback. Mounts only on a profiled FALLBACK_2D device (defence in depth, like SceneViewport). */
export function FlatViewport({ mode }: { readonly mode: InteractionMode }) {
  const profiled = useDeviceStore((s) => s.profiled);
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  if (!profiled || qualityTier !== "FALLBACK_2D") return null;
  return mode === "CUSTOMIZE" ? <FlatKrathongPreview /> : <FlatRiverView mode={mode} />;
}
