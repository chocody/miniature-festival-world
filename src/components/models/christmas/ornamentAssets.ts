import { BufferAttribute, BufferGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import { KRATHONG_MATTE_SURFACE } from "@/config/krathongModel.config";
import { ORNAMENT_DESIGN_IDS, type OrnamentDesignId } from "@/config/ornamentDesigns.config";
import {
  ORNAMENT_DESIGN_BODY_MATERIAL,
  ORNAMENT_FALLBACK_SPHERE_SEGMENTS,
  ORNAMENT_MODEL_RADIUS,
  ornamentDesignSource,
  ornamentFallbackColor,
  type OrnamentLod,
} from "@/config/ornamentModels.config";
import type { OrnamentDesignMeshData, OrnamentHookAnchor } from "@/core/customization/ornamentDesignGlb";
import { loadOrnamentDesign, type OrnamentDesignLoad } from "./ornamentDesignLoader";

/** A loaded owner-made ornament design at one LOD (MFW-101): GPU geometry owned by the assets, hook anchor from the GLB. */
export interface OrnamentDesignAsset {
  readonly design: OrnamentDesignId;
  readonly lod: OrnamentLod;
  readonly geometry: BufferGeometry;
  readonly hook: OrnamentHookAnchor | null;
}

export interface OrnamentAssets {
  /** Starts loading a design file (after the tier is decided). Idempotent; a no-op after dispose or without a glb source. */
  requestDesign(design: OrnamentDesignId, lod: OrnamentLod): void;
  /** The loaded design (same object every call), or null while loading / after a failed load. */
  design(design: OrnamentDesignId, lod: OrnamentLod): OrnamentDesignAsset | null;
  /** +1 for every design that becomes available. */
  getDesignVersion(): number;
  subscribeDesigns(listener: () => void): () => void;
  /** The one vertex-colour material of every design body (ORNAMENT_DESIGN_BODY_MATERIAL). */
  readonly designMaterial: MeshStandardMaterial;
  /** The shared low-poly sphere shown while a design loads, after a failure, or for a design without a source. */
  readonly fallbackGeometry: BufferGeometry;
  /** Matte, tinted with ornamentFallbackColor(design); one material per distinct colour. */
  fallbackMaterial(design: OrnamentDesignId): MeshStandardMaterial;
  /** Every distinct geometry once. */
  listGeometries(): readonly BufferGeometry[];
  listMaterials(): readonly MeshStandardMaterial[];
  /** Disposes every geometry and material once; idempotent. */
  dispose(): void;
}

export interface CreateOrnamentAssetsOptions {
  /** Default: the session-cached fetch loader (ornamentDesignLoader). Tests inject their own. */
  readonly loadDesign?: OrnamentDesignLoad;
}

const POSITION_ITEM_SIZE = 3;
const COLOR_ITEM_SIZE = 4;
const INDEX_ITEM_SIZE = 1;

/** Design geometry from the parsed GLB (positions, normals, RGBA vertex colours, index); views, no copy. */
function buildDesignGeometry(data: OrnamentDesignMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, POSITION_ITEM_SIZE));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, POSITION_ITEM_SIZE));
  geometry.setAttribute("color", new BufferAttribute(data.colors, COLOR_ITEM_SIZE, true));
  geometry.setIndex(new BufferAttribute(data.indices, INDEX_ITEM_SIZE));
  geometry.computeBoundingSphere();
  return geometry;
}

const lodKey = (design: string, lod: string) => `${design}@${lod}`;

/**
 * One geometry per loaded (design, LOD), one shared vertex-colour material, one fallback sphere and one fallback material per
 * distinct tint, per canvas (MFW-101). Everything lives as long as the assets and is disposed with them.
 */
export function createOrnamentAssets(options: CreateOrnamentAssetsOptions = {}): OrnamentAssets {
  const loadDesign = options.loadDesign ?? loadOrnamentDesign;
  const { color, roughness, metalness, vertexColors } = ORNAMENT_DESIGN_BODY_MATERIAL;
  const designMaterial = new MeshStandardMaterial({ color, roughness, metalness, vertexColors });
  const fallbackGeometry = new SphereGeometry(
    ORNAMENT_MODEL_RADIUS,
    ORNAMENT_FALLBACK_SPHERE_SEGMENTS.width,
    ORNAMENT_FALLBACK_SPHERE_SEGMENTS.height,
  );
  fallbackGeometry.computeBoundingSphere();
  const fallbackByColor = new Map<string, MeshStandardMaterial>();
  for (const id of ORNAMENT_DESIGN_IDS) {
    const tint = ornamentFallbackColor(id);
    if (!fallbackByColor.has(tint)) fallbackByColor.set(tint, new MeshStandardMaterial({ ...KRATHONG_MATTE_SURFACE, color: tint }));
  }
  const requested = new Set<string>();
  const designs = new Map<string, OrnamentDesignAsset>();
  const listeners = new Set<() => void>();
  let designVersion = 0;
  let disposed = false;
  return {
    requestDesign(design, lod) {
      const key = lodKey(design, lod);
      if (disposed || requested.has(key) || ornamentDesignSource(design)?.kind !== "glb") return;
      requested.add(key);
      loadDesign(design, lod).then(
        (data) => {
          if (disposed) return;
          designs.set(key, Object.freeze({ design, lod, geometry: buildDesignGeometry(data), hook: data.hook }));
          designVersion += 1;
          for (const listener of [...listeners]) listener();
        },
        () => {}, // the loader records the failure; the fallback sphere stays
      );
    },
    design: (design, lod) => designs.get(lodKey(design, lod)) ?? null,
    getDesignVersion: () => designVersion,
    subscribeDesigns(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    designMaterial,
    fallbackGeometry,
    fallbackMaterial(design) {
      const found = fallbackByColor.get(ornamentFallbackColor(design));
      if (!found) throw new Error(`no fallback material for ornament design ${design}`);
      return found;
    },
    listGeometries: () => [fallbackGeometry, ...[...designs.values()].map((d) => d.geometry)],
    listMaterials: () => [designMaterial, ...fallbackByColor.values()],
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const design of designs.values()) design.geometry.dispose();
      designs.clear();
      fallbackGeometry.dispose();
      designMaterial.dispose();
      for (const material of fallbackByColor.values()) material.dispose();
      listeners.clear();
    },
  };
}
