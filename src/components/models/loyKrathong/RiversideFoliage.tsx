"use client";

import { useMemo, type JSX } from "react";
import { InstancedPart } from "@/components/canvas3d/InstancedPart";
import { SCENE_OBJECT_NAMES } from "@/components/canvas3d/sceneObjectNames";
import { SwayingInstancedPart } from "@/components/canvas3d/SwayingInstancedPart";
import { RIVER_FOLIAGE_SWAY } from "@/config/events/loyKrathong.river.config";
import type { NudgeSource } from "@/core/effects";
import type { RiversideFoliageLayout } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { foliageForTier } from "./riverLayout";

export interface RiversideFoliageProps {
  readonly foliage: RiversideFoliageLayout;
  readonly shadows: boolean;
  readonly now?: () => number; // default performance.now() (FlameFlicker pattern)
  /** MFW-60: the shared nudge pool; a tapped tree, bush or reed shakes (null / absent = no tap reactions). */
  readonly nudges?: NudgeSource | null;
}

const performanceNow = () => performance.now();

/**
 * Riverside foliage (MFW-70): static trunks, leaf clumps (tree crowns and bushes) and reed / grass tufts; three draw calls on
 * every tier. The tier picks the variant (FOLIAGE_TIERS: LOW draws the LIGHT one); the clumps and tufts sway on HIGH / MEDIUM
 * unless reduced motion is on (invariant F).
 */
export function RiversideFoliage({ foliage, shadows, now = performanceNow, nudges = null }: RiversideFoliageProps): JSX.Element {
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const tier = qualityTier === "FALLBACK_2D" ? "LOW" : qualityTier;
  const view = useMemo(() => foliageForTier(foliage, tier), [foliage, tier]);
  const swayOn = view.sway && !reducedMotion;
  return (
    <>
      <InstancedPart name={SCENE_OBJECT_NAMES.treeTrunks} part={view.parts.treeTrunk} transforms={view.trunks} shadows={shadows} />
      <SwayingInstancedPart
        name={SCENE_OBJECT_NAMES.leafClumps}
        part={view.parts.leafClump}
        instances={view.clumps}
        shadows={shadows}
        sway={swayOn ? RIVER_FOLIAGE_SWAY.leafClump : null}
        now={now}
        shakeOwners={view.clumpOwners}
        nudges={nudges}
      />
      <SwayingInstancedPart
        name={SCENE_OBJECT_NAMES.riversidePlants}
        part={view.parts.riversidePlant}
        instances={view.plants}
        shadows={shadows}
        sway={swayOn ? RIVER_FOLIAGE_SWAY.riversidePlant : null}
        now={now}
        shakeOwners={view.plantOwners}
        nudges={nudges}
      />
    </>
  );
}
