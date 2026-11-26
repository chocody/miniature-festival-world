"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, type JSX } from "react";
import type { SceneTargetKind } from "@/config/gimmicks.config";
import type { WorldXZ } from "@/core/coordinates";
import type { PropTapTarget } from "./propTapTargets";
import { propProxyTakesTap } from "./riverHitPick";
import { createTapProxy } from "./riverTapProxy";
import { isTapClick } from "./tapPoint";

export type PropTappedHandler = (kind: SceneTargetKind, index: number, at: WorldXZ | null) => void;

export interface PropTapProxiesProps {
  readonly targets: readonly PropTapTarget[];
  readonly onPropTapped: PropTappedHandler;
}

/**
 * MFW-60: invisible tap proxies (raycast only, no draw call) for houses, trees, bushes, reeds and rocks. One shared unit icosahedron,
 * scaled per target to a ≥ MIN_TOUCH_TARGET_PX disc. Tap priority rule 2 (propProxyTakesTap); a drag never fires a reaction. Mounted
 * only in WORLD_EXPLORE (ToyNightScene passes onPropTapped only there). No useFrame.
 */
export function PropTapProxies({ targets, onPropTapped }: PropTapProxiesProps): JSX.Element {
  const proxy = useMemo(() => createTapProxy(1), []);
  useEffect(() => () => proxy.dispose(), [proxy]);
  return (
    <>
      {targets.map((t) => (
        <mesh
          key={t.name}
          name={t.name}
          geometry={proxy.geometry}
          material={proxy.material}
          visible={false}
          position={[t.center.x, t.center.y, t.center.z]}
          scale={t.proxyRadius}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            if (!isTapClick(event) || !propProxyTakesTap(event, t.bodyRadius)) return;
            event.stopPropagation();
            onPropTapped(t.kind, t.index, null);
          }}
        />
      ))}
    </>
  );
}
