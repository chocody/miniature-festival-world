import { BufferAttribute, BufferGeometry, MeshStandardMaterial } from "three";
import { KRATHONG_DESIGN_BODY_MATERIAL, KRATHONG_DESIGN_IDS, type KrathongDesignId } from "@/config/krathongDesigns.config";
import { KRATHONG_LODS, type KrathongLod, type KrathongMeshSpec } from "@/config/krathongModel.config";
import {
  KRATHONG_GEOMETRY_KEYS,
  KRATHONG_MATERIAL_KEYS,
  materialSpecFor,
  meshSpecFor,
  type KrathongBatchGeometryKey,
  type KrathongBatchMaterialKey,
  type KrathongFlameAnchor,
  type KrathongGeometryKey,
  type KrathongMaterialKey,
} from "@/core/customization";
import type { KrathongDesignMeshData } from "@/core/customization/krathongDesignGlb";
import { loadKrathongDesign, type KrathongDesignLoad } from "./krathongDesignLoader";

/** A loaded owner-supplied design at one LOD (MFW-65): GPU geometry owned by the assets, flame anchors from the GLB. */
export interface KrathongDesignAsset {
  /** MFW-78: which design this is (the hero body records it in userData). */
  readonly design: KrathongDesignId;
  readonly geometry: BufferGeometry;
  readonly flames: readonly KrathongFlameAnchor[];
}
import { createFlameFlickerFrame, type FlameFlickerFrame } from "@/core/customization/flameFlicker";
import { buildKrathongMeshData } from "@/core/customization/krathongMeshData";

export interface KrathongAssets {
  /** Same object for the same (key, lod), every call; default lod "full". Identical mesh specs share one geometry (MFW-69). */
  geometry(key: KrathongGeometryKey, lod?: KrathongLod): BufferGeometry;
  material(key: KrathongMaterialKey): MeshStandardMaterial;
  /** Every distinct geometry once. */
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  /** MFW-65: starts loading a design file (after the tier is decided). Idempotent; a no-op after dispose. */
  requestDesign(design: KrathongDesignId, lod: KrathongLod): void;
  /** The loaded design (same object every call), or null while loading / after a failed load. */
  design(design: KrathongDesignId, lod: KrathongLod): KrathongDesignAsset | null;
  /** +1 for every design that becomes available. */
  getDesignVersion(): number;
  subscribeDesigns(listener: () => void): () => void;
  /** The one vertex-colour material of every design body (hero and river). */
  readonly designMaterial: MeshStandardMaterial;
  /** River batch: a design key not loaded yet → the empty placeholder geometry. */
  batchGeometry(key: KrathongBatchGeometryKey, lod: KrathongLod): BufferGeometry;
  batchMaterial(key: KrathongBatchMaterialKey): MeshStandardMaterial;
  /** Shared flame flicker of this canvas: written once per frame by <FlameFlicker>, read by KrathongModel and the river batch. */
  readonly flameFlicker: FlameFlickerFrame;
  /** Disposes every geometry and material once; idempotent. */
  dispose(): void;
}

const POSITION_ITEM_SIZE = 3;
const INDEX_ITEM_SIZE = 1;

/** Parametric clay mesh (v2 MFW-48, v3 MFW-69): indexed closed solid with smooth normals. */
function buildGeometry(spec: KrathongMeshSpec): BufferGeometry {
  const data = buildKrathongMeshData(spec);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, POSITION_ITEM_SIZE));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const lodKey = (key: string, lod: string) => `${key}@${lod}`;

const COLOR_ITEM_SIZE = 4;

/** Design geometry from the parsed GLB (positions, normals, RGBA vertex colours, index); views, no copy. */
function buildDesignGeometry(data: KrathongDesignMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, POSITION_ITEM_SIZE));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, POSITION_ITEM_SIZE));
  geometry.setAttribute("color", new BufferAttribute(data.colors, COLOR_ITEM_SIZE, true));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeBoundingSphere();
  return geometry;
}

const DESIGN_KEY_PREFIX = "design:";
function designOfKey(key: KrathongBatchGeometryKey): KrathongDesignId | null {
  if (!key.startsWith(DESIGN_KEY_PREFIX)) return null;
  const id = key.slice(DESIGN_KEY_PREFIX.length);
  return (KRATHONG_DESIGN_IDS as readonly string[]).includes(id) ? (id as KrathongDesignId) : null;
}

export interface CreateKrathongAssetsOptions {
  /** Default: the session-cached fetch loader (krathongDesignLoader). Tests inject their own. */
  readonly loadDesign?: KrathongDesignLoad;
}

/**
 * One three geometry per (key, LOD) and one material per key; every krathong part under one canvas shares them.
 * All LODs are built eagerly (pure CPU, small buffers); only the ones drawn are uploaded to the GPU.
 * MFW-65: owner-supplied design geometry is built per (design, LOD) once its file has loaded; it lives as long as the assets
 * (one per canvas), so zone switches create and free nothing.
 */
export function createKrathongAssets(options: CreateKrathongAssetsOptions = {}): KrathongAssets {
  const loadDesign = options.loadDesign ?? loadKrathongDesign;
  const bySpec = new Map<KrathongMeshSpec, BufferGeometry>();
  const geometries = new Map<string, BufferGeometry>();
  for (const key of KRATHONG_GEOMETRY_KEYS) {
    for (const lod of KRATHONG_LODS) {
      const spec = meshSpecFor(key, lod);
      let geometry = bySpec.get(spec);
      if (geometry === undefined) {
        geometry = buildGeometry(spec);
        bySpec.set(spec, geometry);
      }
      geometries.set(lodKey(key, lod), geometry);
    }
  }
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
  const { color, roughness, metalness, vertexColors } = KRATHONG_DESIGN_BODY_MATERIAL;
  const designMaterial = new MeshStandardMaterial({ color, roughness, metalness, vertexColors });
  const placeholderGeometry = new BufferGeometry();
  const requested = new Set<string>();
  const designs = new Map<string, KrathongDesignAsset>();
  const designListeners = new Set<() => void>();
  let designVersion = 0;
  let disposed = false;
  const geometryOf = (key: KrathongGeometryKey, lod: KrathongLod = "full"): BufferGeometry => {
    const found = geometries.get(lodKey(key, lod));
    if (!found) throw new Error(`unknown krathong asset key: ${key}`);
    return found;
  };
  const materialOf = (key: KrathongMaterialKey): MeshStandardMaterial => {
    const found = materials.get(key);
    if (!found) throw new Error(`unknown krathong asset key: ${key}`);
    return found;
  };
  return {
    requestDesign(design, lod) {
      const key = lodKey(design, lod);
      if (disposed || requested.has(key)) return;
      requested.add(key);
      loadDesign(design, lod).then(
        (data) => {
          if (disposed) return;
          designs.set(key, Object.freeze({ design, geometry: buildDesignGeometry(data), flames: data.flames }));
          designVersion += 1;
          for (const listener of [...designListeners]) listener();
        },
        () => {}, // the loader records the failure (data-krathong-models="failed"); the procedural model stays
      );
    },
    design: (design, lod) => designs.get(lodKey(design, lod)) ?? null,
    getDesignVersion: () => designVersion,
    subscribeDesigns(listener) {
      designListeners.add(listener);
      return () => {
        designListeners.delete(listener);
      };
    },
    designMaterial,
    batchGeometry(key, lod) {
      const design = designOfKey(key);
      if (design === null) return geometryOf(key as KrathongGeometryKey, lod);
      return designs.get(lodKey(design, lod))?.geometry ?? placeholderGeometry;
    },
    batchMaterial(key) {
      return key === "designBody" ? designMaterial : materialOf(key);
    },
    geometry: geometryOf,
    material: materialOf,
    listGeometries: () => [...bySpec.values(), ...[...designs.values()].map((d) => d.geometry)],
    listMaterials: () => [...materials.values(), designMaterial],
    flameFlicker: createFlameFlickerFrame(),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of bySpec.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      for (const design of designs.values()) design.geometry.dispose();
      designs.clear();
      designMaterial.dispose();
      placeholderGeometry.dispose();
      designListeners.clear();
    },
  };
}
