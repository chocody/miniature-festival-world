"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState, type JSX, type Ref } from "react";
import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type MeshBasicMaterial } from "three";
import { RIVER_WATER_HIGHLIGHTS } from "@/config/events/loyKrathong.river.config";
import {
  BLOB_SHADOW_LOOK,
  BLOB_SHADOW_TIER_GEOMETRY,
  WATER_HIGHLIGHT_LOOK,
} from "@/config/look.config";
import { WATER_EFFECT_TIERS, type RenderTier } from "@/config/performance.config";
import { createSplinePoseOut, splineProgressToPoseInto } from "@/core/coordinates";
import {
  buildRingFanData,
  buildShoreHighlightData,
  createGlintPoseOut,
  waterGlintPoseInto,
  type RiverEnvironmentLayout,
} from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import {
  commitBlobShadows,
  createBlobShadowGeometry,
  createBlobShadowInstances,
  createFanMaterial,
  createVertexAlphaGeometry,
  writeBlobShadowAt,
} from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";
import { useStretchVisibility } from "./stretchVisibility";

/**
 * Stylized water fans (MFW-49 AC4; the lamp light pools were removed in MFW-67). Every mesh is a vertex-alpha InstancedMesh (one
 * instance where static), so all of them share the blob-shadow shader program; none takes taps (NO_RAYCAST via
 * createBlobShadowInstances), none casts or receives shadows, each owns and disposes its geometry and material.
 */

const STATIC_TIME_MS = 0;
const IDENTITY_SCALE = 1;

function useRenderTier(): RenderTier {
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  return qualityTier === "FALLBACK_2D" ? "LOW" : qualityTier; // FALLBACK_2D never renders 3D; treated as LOW
}

/** Geometry + material + one InstancedMesh, all disposed when any of them is re-created and on unmount. */
function useFanMesh(geometry: BufferGeometry, material: MeshBasicMaterial, capacity: number, name: string): InstancedMesh {
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useMemo(
    () => createBlobShadowInstances(geometry, material, capacity, name),
    [geometry, material, capacity, name],
  );
  useEffect(() => () => mesh.dispose(), [mesh]);
  return mesh;
}

/** Soft light band along both banks inside the water. Static, every 3D tier (the LOW cheap variant is this band alone). */
export function ShoreHighlights({ layout }: { readonly layout: RiverEnvironmentLayout }): JSX.Element {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(
    () =>
      createVertexAlphaGeometry(
        buildShoreHighlightData(layout.channel, RIVER_WATER_HIGHLIGHTS.shore.bandWidth, layout.ribbonSegments),
      ),
    [layout],
  );
  const material = useMemo(
    () => createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.shoreOpacity, additive: false }),
    [],
  );
  const mesh = useFanMesh(geometry, material, 1, SCENE_OBJECT_NAMES.shoreHighlights);
  const [scratch] = useState(() => new Matrix4());
  useLayoutEffect(() => {
    writeBlobShadowAt(mesh, 0, 0, layout.waterSurfaceY + RIVER_WATER_HIGHLIGHTS.liftY, 0, IDENTITY_SCALE, scratch);
    commitBlobShadows(mesh, 1);
    invalidate();
  }, [mesh, layout, scratch, invalidate]);
  return <primitive object={mesh} name={SCENE_OBJECT_NAMES.shoreHighlights} />;
}

/** Tier blob fan (BLOB_SHADOW_TIER_GEOMETRY): the round soft shape of glints and lamp light pools. */
function useTierFanGeometry(tier: RenderTier): BufferGeometry {
  return useMemo(
    () => createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY[tier], falloffExponent: BLOB_SHADOW_LOOK.falloffExponent }),
    [tier],
  );
}

interface GlintScratch {
  readonly glint: ReturnType<typeof createGlintPoseOut>;
  readonly pose: ReturnType<typeof createSplinePoseOut>;
  readonly matrix: Matrix4;
  readonly position: Vector3;
  readonly scale: Vector3;
  readonly euler: Euler;
  readonly quaternion: Quaternion;
}

function writeGlints(mesh: InstancedMesh, layout: RiverEnvironmentLayout, count: number, timeMs: number, s: GlintScratch): void {
  const spec = RIVER_WATER_HIGHLIGHTS.glint;
  const y = layout.waterSurfaceY + RIVER_WATER_HIGHLIGHTS.liftY;
  for (let i = 0; i < count; i++) {
    waterGlintPoseInto(i, count, timeMs, spec, s.glint);
    splineProgressToPoseInto(layout.channel, s.glint.progress, s.glint.lateral, s.pose);
    s.position.set(s.pose.x, y, s.pose.z);
    s.quaternion.setFromEuler(s.euler.set(0, s.pose.yawRad, 0));
    const env = s.glint.envelope;
    s.scale.set(spec.radiusAcross * env, 1, spec.radiusAlong * env);
    mesh.setMatrixAt(i, s.matrix.compose(s.position, s.quaternion, s.scale));
  }
  commitBlobShadows(mesh, count);
}

/**
 * Gentle highlights drifting downstream near both banks (count per tier from WATER_EFFECT_TIERS; none on LOW).
 * Reduced motion: written once at t = 0 (static). Otherwise moved on every rendered frame, but it never calls invalidate():
 * it moves whenever the scene already renders continuously (WORLD_EXPLORE, where krathongs drift; lead decision D7).
 */
export function WaterGlints({
  layout,
  now,
}: {
  readonly layout: RiverEnvironmentLayout;
  readonly now: () => number;
}): JSX.Element | null {
  const tier = useRenderTier();
  const reducedMotion = useDeviceStore((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);
  const count = WATER_EFFECT_TIERS[tier].glintCount;
  const geometry = useTierFanGeometry(tier);
  const material = useMemo(
    () => createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.glintOpacity, additive: false }),
    [],
  );
  const mesh = useFanMesh(geometry, material, Math.max(count, 1), SCENE_OBJECT_NAMES.waterGlints);
  const stretchVisible = useStretchVisibility();
  const [scratch] = useState<GlintScratch>(() => ({
    glint: createGlintPoseOut(),
    pose: createSplinePoseOut(),
    matrix: new Matrix4(),
    position: new Vector3(),
    scale: new Vector3(),
    euler: new Euler(),
    quaternion: new Quaternion(),
  }));
  useLayoutEffect(() => {
    if (count === 0) return;
    writeGlints(mesh, layout, count, reducedMotion ? STATIC_TIME_MS : now(), scratch);
    invalidate();
  }, [mesh, layout, count, reducedMotion, now, scratch, invalidate]);
  useFrame(() => {
    if (reducedMotion || count === 0 || !stretchVisible.visible) return; // MFW-58: a culled stretch copy skips its writes
    writeGlints(mesh, layout, count, now(), scratch);
  });
  if (count === 0) return null;
  return <primitive object={mesh} name={SCENE_OBJECT_NAMES.waterGlints} />;
}

export interface KrathongRipplesHandle {
  writeAt(index: number, x: number, z: number, scale: number): void;
  /** Collapses slot `index` to zero scale (an item rendered without a transform this frame). */
  hideAt(index: number): void;
  commit(count: number): void;
}

export interface KrathongRipplesProps {
  readonly capacity: number;
  readonly surfaceY: number; // world y of the water surface
  readonly ref?: Ref<KrathongRipplesHandle>;
}

/** Soft ring around every river krathong (one draw call up to `capacity`); RiverFlow writes them per frame through the handle. */
export function KrathongRipples({ capacity, surfaceY, ref }: KrathongRipplesProps): JSX.Element {
  const geometry = useMemo(() => createVertexAlphaGeometry(buildRingFanData(RIVER_WATER_HIGHLIGHTS.ripple)), []);
  const material = useMemo(
    () => createFanMaterial({ color: WATER_HIGHLIGHT_LOOK.color, opacity: WATER_HIGHLIGHT_LOOK.rippleOpacity, additive: false }),
    [],
  );
  const mesh = useFanMesh(geometry, material, capacity, SCENE_OBJECT_NAMES.krathongRipples);
  const [scratch] = useState(() => new Matrix4());
  const y = surfaceY + RIVER_WATER_HIGHLIGHTS.liftY;
  useImperativeHandle(
    ref,
    () => ({
      writeAt(index, x, z, scale) {
        writeBlobShadowAt(mesh, index, x, y, z, scale, scratch);
      },
      hideAt(index) {
        writeBlobShadowAt(mesh, index, 0, y, 0, 0, scratch);
      },
      commit(count) {
        commitBlobShadows(mesh, count);
      },
    }),
    [mesh, y, scratch],
  );
  return <primitive object={mesh} name={SCENE_OBJECT_NAMES.krathongRipples} />;
}
