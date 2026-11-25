"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState, type JSX, type RefObject } from "react";
import { MeshStandardMaterial, type InstancedMesh } from "three";
import { AMBIENT_MOTES, LANTERN_FLICKER } from "@/config/events/loyKrathong.life.config";
import { VILLAGE_LIGHTS, type LightPresetId } from "@/config/look.config";
import { prepareMoteAnchors, type RiverEnvironmentLayout } from "@/core/world";
import {
  applyMoteLook,
  createMoteGeometry,
  createMoteInstances,
  createMoteMaterial,
  createMoteWriteScratch,
  writeLanternFlicker,
  writeMoteInstances,
} from "./ambientMeshes";
import { useIdleRedraw } from "./idleRedraw";
import { useLivingWorldSettings } from "./useLivingWorldSettings";

/**
 * MFW-50 ambient life (backlog story 9-4, AC3, AC4): floating light motes (fireflies at NIGHT) and flickering lanterns at NIGHT
 * (foliage sway is MFW-70's RiversideFoliage), plus the living world's registration with the shared idle-redraw ticker.
 * Everything reads the tier and reduced motion from the store (invariant F); reduced motion freezes all of it. Nothing here
 * takes taps.
 */

export interface AmbientLifeProps {
  readonly layout: RiverEnvironmentLayout;
  readonly now: () => number;
  readonly lightPreset: LightPresetId;
  readonly lampHeadMeshRef: RefObject<InstancedMesh | null>;
  /**
   * true only in the shared world view (WORLD_EXPLORE): the living world may then keep an idle-redraw cadence. In CUSTOMIZE and
   * RITUAL it registers nothing and advances only on frames drawn anyway (the flame-flicker cadence).
   */
  readonly idleRedraw: boolean;
}

export function AmbientLife({ layout, now, lightPreset, lampHeadMeshRef, idleRedraw }: AmbientLifeProps): JSX.Element {
  return (
    <>
      <AmbientMotes layout={layout} now={now} lightPreset={lightPreset} />
      <LanternFlicker now={now} lightPreset={lightPreset} meshRef={lampHeadMeshRef} />
      <AmbientTicker enabled={idleRedraw} />
    </>
  );
}

/** Soft floating points over both banks (one draw call); count per tier, none on LOW. Recoloured, never re-created, per preset. */
export function AmbientMotes({
  layout,
  now,
  lightPreset,
}: {
  readonly layout: RiverEnvironmentLayout;
  readonly now: () => number;
  readonly lightPreset: LightPresetId;
}): JSX.Element | null {
  const s = useLivingWorldSettings();
  const invalidate = useThree((state) => state.invalidate);
  const count = s.moteCount;
  const moving = s.motesMove;
  const geometry = useMemo(() => createMoteGeometry(), []);
  const material = useMemo(() => createMoteMaterial("NIGHT"), []); // recoloured per preset below (never re-created)
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const anchors = useMemo(() => prepareMoteAnchors(count, layout.channel, layout.bankProfile, AMBIENT_MOTES), [count, layout]);
  const mesh = useMemo(() => (count > 0 ? createMoteInstances(geometry, material, count) : null), [geometry, material, count]);
  useEffect(() => () => mesh?.dispose(), [mesh]);
  const [scratch] = useState(createMoteWriteScratch);

  useLayoutEffect(() => {
    applyMoteLook(material, lightPreset);
    invalidate();
  }, [material, lightPreset, invalidate]);

  useLayoutEffect(() => {
    if (!mesh) return;
    writeMoteInstances(mesh, anchors, now(), moving, AMBIENT_MOTES, scratch);
    invalidate();
  }, [mesh, anchors, now, moving, scratch, invalidate]);

  useFrame(() => {
    if (!mesh || !moving) return;
    writeMoteInstances(mesh, anchors, now(), true, AMBIENT_MOTES, scratch);
  });

  return mesh ? <primitive object={mesh} /> : null;
}

/** NIGHT lanterns breathe slowly (the shared lamp-head emissive uniform: no draw call, no halo). DAY lanterns are off. */
export function LanternFlicker({
  now,
  lightPreset,
  meshRef,
}: {
  readonly now: () => number;
  readonly lightPreset: LightPresetId;
  readonly meshRef: RefObject<InstancedMesh | null>;
}): null {
  const s = useLivingWorldSettings();
  const invalidate = useThree((state) => state.invalidate);
  const base = VILLAGE_LIGHTS[lightPreset].lanternEmissiveIntensity;
  const active = s.lanternFlicker && base > 0;

  useLayoutEffect(() => {
    const material = meshRef.current?.material;
    if (active || !(material instanceof MeshStandardMaterial)) return;
    writeLanternFlicker(material, base, 0, false, LANTERN_FLICKER); // = base, as RiverEnvironment's InstancedPart writes it
    invalidate();
  }, [active, base, meshRef, invalidate]);

  useFrame(() => {
    const material = meshRef.current?.material;
    if (!active || !(material instanceof MeshStandardMaterial)) return;
    writeLanternFlicker(material, base, now(), true, LANTERN_FLICKER);
  });

  return null;
}

/**
 * The living world's idle-redraw cap (lead decision D4, MFW-50 fix round): while villagers, motes or lanterns move AND `enabled`
 * (the shared world view only), it registers LIVING_WORLD_TIERS[tier].idleRedrawIntervalMs with the canvas's ONE shared
 * idle-redraw ticker (idleRedraw.ts, also used by the flame flicker): one timer at the smallest registered interval, none in a
 * hidden tab. None on LOW or under reduced motion. RiverFlow's per-frame invalidate merges with it.
 */
export function AmbientTicker({ enabled }: { readonly enabled: boolean }): null {
  const s = useLivingWorldSettings();
  useIdleRedraw(enabled ? s.idleRedrawIntervalMs : null);
  return null;
}
