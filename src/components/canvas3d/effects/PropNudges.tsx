"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { InstancedMesh, Matrix4, type Mesh } from "three";
import type { ScenePartSpec } from "@/config/scene.config";
import { createNudgeFrame, findNudgeEntry, writeNudgeAt, type NudgeSource } from "@/core/effects";
import type { InstanceTransform } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { composeInstanceMatrix } from "../instancing";

export interface PropNudgesProps {
  readonly nudges: NudgeSource;
  readonly rockMeshRef: RefObject<InstancedMesh | null>;
  readonly rocks: readonly InstanceTransform[];
  readonly rockPart: Pick<ScenePartSpec, "yOffset" | "yawOffsetRad">;
  readonly pierDeckRef: RefObject<Mesh | null>;
}

interface PropNudgeScratch {
  readonly base: Matrix4;
  readonly scale: Matrix4;
}

/**
 * MFW-60: a tapped rock or the pier bounces (reduced motion: a steady size-up). Writes only while a rock / pier nudge is active, plus
 * one frame that restores the rest pose; idle frames touch nothing. Never calls invalidate() (SceneEffects keeps the loop alive while
 * a nudge runs). Creates no three resource beyond two scratch matrices.
 */
export function PropNudges({ nudges, rockMeshRef, rocks, rockPart, pierDeckRef }: PropNudgesProps): null {
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const [scratch] = useState<PropNudgeScratch>(() => ({ base: new Matrix4(), scale: new Matrix4() }));
  const [frame] = useState(createNudgeFrame);
  /** 1 = rock i was written nudged on the last frame (it needs one rest write after its entry ends). */
  const nudgedRocks = useRef<Uint8Array>(new Uint8Array(0));
  useLayoutEffect(() => {
    nudgedRocks.current = new Uint8Array(rocks.length);
  }, [rocks]);
  const pierNudged = useRef(false);
  const rocksDirty = useRef(false);

  useFrame(() => {
    const pool = nudges.pool;
    if (pool.activeCount === 0 && !rocksDirty.current && !pierNudged.current) return;
    const t = nudges.now();
    const mesh = rockMeshRef.current;
    const mask = nudgedRocks.current;
    if (mesh instanceof InstancedMesh && mask.length === rocks.length) {
      let wrote = false;
      let any = false;
      for (let i = 0; i < rocks.length; i++) {
        const e = findNudgeEntry(pool, "rock", i);
        if (e === null && mask[i] === 0) continue;
        composeInstanceMatrix(rocks[i], rockPart, scratch.base);
        if (e !== null) {
          const f = writeNudgeAt("rock", t - e.startedAtMs, reducedMotion, frame);
          scratch.base.multiply(scratch.scale.makeScale(f.scale, f.scale, f.scale));
          mask[i] = 1;
          any = true;
        } else {
          mask[i] = 0;
        }
        mesh.setMatrixAt(i, scratch.base);
        wrote = true;
      }
      if (wrote) mesh.instanceMatrix.needsUpdate = true;
      rocksDirty.current = any;
    }
    const deck = pierDeckRef.current;
    if (deck) {
      const e = findNudgeEntry(pool, "pier", 0);
      if (e !== null) {
        deck.scale.setScalar(writeNudgeAt("pier", t - e.startedAtMs, reducedMotion, frame).scale);
        pierNudged.current = true;
      } else if (pierNudged.current) {
        deck.scale.setScalar(1);
        pierNudged.current = false;
      }
    }
  });

  return null;
}
