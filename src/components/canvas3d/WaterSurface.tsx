"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, type JSX, type RefObject } from "react";
import type { BufferAttribute, Mesh } from "three";
import { RIVER_WATER_WAVES } from "@/config/events/loyKrathong.river.config";
import { WATER_EFFECT_TIERS } from "@/config/performance.config";
import { TOY_MATTE_MATERIALS } from "@/config/scene.config";
import type { EndlessRiverFrame } from "@/core/coordinates/endlessRiverFrame";
import { writeWaterWaveNormals, type RibbonGeometryData } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import { createWaterSurfaceGeometry } from "./geometry";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { useStretchVisibility } from "./stretchVisibility";

/** Reduced motion, LOW and a surface without a clock show the swells frozen at this time (as WaterGlints). */
const STATIC_TIME_MS = 0;

interface WaterAttributes {
  readonly position: BufferAttribute;
  readonly normal: BufferAttribute;
}

/** Writes the swell normals at `timeMs` into the normal buffer and flags it for upload (allocation-free). */
function writeSwells(attributes: WaterAttributes, frame: EndlessRiverFrame, timeMs: number): void {
  const { position, normal } = attributes;
  writeWaterWaveNormals(position.array, position.count, frame, timeMs, RIVER_WATER_WAVES, normal.array as Float32Array);
  normal.needsUpdate = true;
}

export interface WaterSurfaceProps {
  readonly data: RibbonGeometryData; // layout.water
  readonly surfaceY: number; // layout.waterSurfaceY
  readonly frame: EndlessRiverFrame;
  readonly shadows: boolean; // receiveShadow
  readonly waterRef: RefObject<Mesh | null>;
  readonly now?: () => number; // absent = static (t = STATIC_TIME_MS)
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
}

/**
 * MFW-79 river water with more depth: the flat water ribbon (same material and shader program as before) whose vertex normals
 * carry soft swells (RIVER_WATER_WAVES). HIGH / MEDIUM: the swells drift with the flow on every rendered frame; the frame callback
 * never calls invalidate() (rule D7) and a culled stretch copy skips its writes (MFW-58). LOW and reduced motion: written once at
 * t = 0 (still water). Positions stay flat, so taps and everything floating on the water are unchanged.
 */
export function WaterSurface({ data, surfaceY, frame, shadows, waterRef, now, onClick }: WaterSurfaceProps): JSX.Element {
  const tier = useDeviceStore((s) => s.qualityTier);
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);
  const stretchVisible = useStretchVisibility();
  const geometry = useMemo(() => createWaterSurfaceGeometry(data), [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const attributes = useMemo<WaterAttributes>(
    () => ({
      position: geometry.getAttribute("position") as BufferAttribute,
      normal: geometry.getAttribute("normal") as BufferAttribute,
    }),
    [geometry],
  );
  const animate = WATER_EFFECT_TIERS[tier].waveMotion && !reducedMotion && now !== undefined;
  // Still water ignores the clock, so a new clock function never rewrites (and re-uploads) the static swells.
  const clock = animate ? now : undefined;
  useLayoutEffect(() => {
    writeSwells(attributes, frame, clock !== undefined ? clock() : STATIC_TIME_MS);
    invalidate();
  }, [attributes, clock, frame, invalidate]);
  useFrame(() => {
    if (clock === undefined || !stretchVisible.visible) return;
    writeSwells(attributes, frame, clock());
  });
  return (
    <mesh
      ref={waterRef}
      name={SCENE_OBJECT_NAMES.water}
      geometry={geometry}
      position={[0, surfaceY, 0]}
      receiveShadow={shadows}
      onClick={onClick}
    >
      <meshStandardMaterial {...TOY_MATTE_MATERIALS.water} />
    </mesh>
  );
}
