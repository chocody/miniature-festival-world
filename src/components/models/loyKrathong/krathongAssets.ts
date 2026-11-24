import { BufferGeometry, ConeGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import type { PrimitiveGeometrySpec } from "@/config/krathongModel.config";
import {
  geometrySpecFor,
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  materialSpecFor,
  type KrathongGeometryKey,
  type KrathongMaterialKey,
} from "@/core/customization";

export interface KrathongAssets {
  /** Same object for the same key, every call. */
  geometry(key: KrathongGeometryKey): BufferGeometry;
  material(key: KrathongMaterialKey): MeshStandardMaterial;
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  /** Disposes every geometry and material once; idempotent. */
  dispose(): void;
}

function buildGeometry(spec: PrimitiveGeometrySpec): BufferGeometry {
  switch (spec.type) {
    case "cylinder":
      return new CylinderGeometry(spec.radiusTop, spec.radiusBottom, spec.height, spec.radialSegments);
    case "sphere":
      return new SphereGeometry(spec.radius, spec.widthSegments, spec.heightSegments);
    case "cone":
      return new ConeGeometry(spec.radius, spec.height, spec.radialSegments);
  }
}

/** One three geometry/material per key; every krathong part under one canvas shares them. */
export function createKrathongAssets(): KrathongAssets {
  const geometries = new Map<string, BufferGeometry>(
    KRATHONG_GEOMETRY_KEYS.map((key) => [key, buildGeometry(geometrySpecFor(key))]),
  );
  const materials = new Map<string, MeshStandardMaterial>(
    KRATHONG_MATERIAL_KEYS.map((key) => {
      const { color, roughness, metalness, emissive, emissiveIntensity } = materialSpecFor(key);
      return [
        key,
        new MeshStandardMaterial({
          color,
          roughness,
          metalness,
          ...(emissive ? { emissive, emissiveIntensity } : {}),
        }),
      ];
    }),
  );
  let disposed = false;
  return {
    geometry(key) {
      const found = geometries.get(key);
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    material(key) {
      const found = materials.get(key);
      if (!found) throw new Error(`unknown krathong asset key: ${key}`);
      return found;
    },
    listGeometries: () => [...geometries.values()],
    listMaterials: () => [...materials.values()],
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
