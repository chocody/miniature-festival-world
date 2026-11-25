"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState, type JSX, type Ref } from "react";
import { Matrix4, type BufferGeometry, type MeshBasicMaterial } from "three";
import { RIVER_ENVIRONMENT_BLOB_SHADOWS } from "@/config/events/loyKrathong.river.config";
import { BLOB_SHADOW_LOOK, BLOB_SHADOW_TIER_GEOMETRY, KRATHONG_BLOB_SHADOW } from "@/config/look.config";
import type { RenderTier } from "@/config/performance.config";
import type { RiverEnvironmentLayout } from "@/core/world";
import { useDeviceStore } from "@/store/useDeviceStore";
import {
  commitBlobShadows,
  createBlobShadowGeometry,
  createBlobShadowInstances,
  createBlobShadowMaterial,
  writeBlobShadowAt,
  writeStaticBlobShadows,
} from "./blobShadowMeshes";
import { SCENE_OBJECT_NAMES } from "./sceneObjectNames";

export interface BlobShadowAssets {
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
}

/**
 * Tier geometry (LOW = cheap 10×2 fan) and the shared blob material; both disposed on tier change and unmount.
 * FALLBACK_2D never renders a 3D scene; it is treated as LOW. Nothing animates, so reduced motion changes nothing.
 */
export function useBlobShadowAssets(): BlobShadowAssets {
  const qualityTier = useDeviceStore((s) => s.qualityTier);
  const tier: RenderTier = qualityTier === "FALLBACK_2D" ? "LOW" : qualityTier;
  const geometry = useMemo(() => createBlobShadowGeometry({ ...BLOB_SHADOW_TIER_GEOMETRY[tier], falloffExponent: BLOB_SHADOW_LOOK.falloffExponent }), [tier]);
  const material = useMemo(() => createBlobShadowMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return useMemo(() => ({ geometry, material }), [geometry, material]);
}

/** Soft blobs under every house, tree and lamp: one InstancedMesh (one draw call), filled once. */
export function EnvironmentBlobShadows({ layout }: { readonly layout: RiverEnvironmentLayout }): JSX.Element {
  const { geometry, material } = useBlobShadowAssets();
  const invalidate = useThree((s) => s.invalidate);
  const capacity = layout.houses.length + layout.trees.length + layout.lamps.length;
  const mesh = useMemo(
    () => createBlobShadowInstances(geometry, material, capacity, SCENE_OBJECT_NAMES.environmentBlobShadows),
    [geometry, material, capacity],
  );
  useEffect(() => () => mesh.dispose(), [mesh]);
  useLayoutEffect(() => {
    writeStaticBlobShadows(
      mesh,
      [
        { transforms: layout.houses, radii: RIVER_ENVIRONMENT_BLOB_SHADOWS.houses },
        { transforms: layout.trees, radii: RIVER_ENVIRONMENT_BLOB_SHADOWS.trees },
        { transforms: layout.lamps, radii: RIVER_ENVIRONMENT_BLOB_SHADOWS.lamps },
      ],
      BLOB_SHADOW_LOOK.liftY,
    );
    invalidate();
  }, [mesh, layout, invalidate]);
  return <primitive object={mesh} name={SCENE_OBJECT_NAMES.environmentBlobShadows} />;
}

export interface DynamicBlobShadowsHandle {
  writeAt(index: number, x: number, z: number): void;
  /** Collapses slot `index` to zero scale (an item rendered without a transform this frame). */
  hideAt(index: number): void;
  commit(count: number): void;
}

export interface DynamicBlobShadowsProps {
  readonly name: string;
  readonly capacity: number;
  readonly surfaceY: number; // world y the blobs lie on (the water surface)
  readonly radius: number; // world units
  readonly ref?: Ref<DynamicBlobShadowsHandle>;
}

/** Moving round blobs (one draw call for any count up to `capacity`); the owner writes them per frame through the handle. */
export function DynamicBlobShadows({ name, capacity, surfaceY, radius, ref }: DynamicBlobShadowsProps): JSX.Element {
  const { geometry, material } = useBlobShadowAssets();
  const mesh = useMemo(
    () => createBlobShadowInstances(geometry, material, capacity, name),
    [geometry, material, capacity, name],
  );
  useEffect(() => () => mesh.dispose(), [mesh]);
  const [scratch] = useState(() => new Matrix4());
  const y = surfaceY + BLOB_SHADOW_LOOK.liftY;
  useImperativeHandle(
    ref,
    () => ({
      writeAt(index, x, z) {
        writeBlobShadowAt(mesh, index, x, y, z, radius, scratch);
      },
      hideAt(index) {
        writeBlobShadowAt(mesh, index, 0, y, 0, 0, scratch);
      },
      commit(count) {
        commitBlobShadows(mesh, count);
      },
    }),
    [mesh, y, radius, scratch],
  );
  return <primitive object={mesh} name={name} />;
}

/**
 * Soft ring under the own krathong, krathong model units (the base centre is the water line). A one-instance
 * InstancedMesh, so it shares the compiled blob program with the other blobs (one shader compile fewer on SwiftShader).
 */
export function KrathongBlobShadow(): JSX.Element {
  const { geometry, material } = useBlobShadowAssets();
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useMemo(
    () => createBlobShadowInstances(geometry, material, 1, SCENE_OBJECT_NAMES.krathongBlobShadow),
    [geometry, material],
  );
  useEffect(() => () => mesh.dispose(), [mesh]);
  const [scratch] = useState(() => new Matrix4());
  useLayoutEffect(() => {
    writeBlobShadowAt(mesh, 0, 0, KRATHONG_BLOB_SHADOW.liftY, 0, KRATHONG_BLOB_SHADOW.radius, scratch);
    commitBlobShadows(mesh, 1);
    invalidate();
  }, [mesh, scratch, invalidate]);
  return <primitive object={mesh} name={SCENE_OBJECT_NAMES.krathongBlobShadow} />;
}
