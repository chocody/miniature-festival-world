import { TREE_ORNAMENT_HIT_RADIUS } from "./events/christmas.tree.config";
import {
  KRATHONG_DESIGN_BODY_MATERIAL,
  KRATHONG_DESIGN_THUMBNAIL_MAX_BYTES,
  KRATHONG_DESIGN_THUMBNAIL_PX,
} from "./krathongDesigns.config";
import { ORNAMENT_DEFAULT_DESIGN, ORNAMENT_DESIGN_IDS, type OrnamentDesignId } from "./ornamentDesigns.config";

/**
 * Owner-made Christmas ornament models (MFW-101, backlog 16.15): one-piece GLBs, decimated offline per LOD and coloured by
 * scripts/christmas-models.mjs (docs/design/models.md §12). Three-free.
 */
export const ORNAMENT_LODS = Object.freeze(["full", "medium", "low"] as const);
export type OrnamentLod = (typeof ORNAMENT_LODS)[number];

/** LOD of the customizer hero. */
export const ORNAMENT_HERO_LOD: OrnamentLod = "full";

/** DRAFT (plan L16 v3): full = customizer hero, medium = tree on HIGH/MEDIUM, low = tree on LOW. */
export const ORNAMENT_MAX_TRIANGLES_BY_LOD: Readonly<Record<OrnamentLod, number>> = Object.freeze({ full: 4000, medium: 400, low: 100 });

/** Guards on the committed files, enforced by tests/unit/christmas-model-assets.test.ts (CA2). */
export const CHRISTMAS_MODEL_ASSET_BUDGET = Object.freeze({
  maxFileBytes: 262_144,
  maxPublicTotalBytes: 1_572_864,
  maxSourceTotalBytes: 655_360,
});

/** Served from public/models/christmas (the committed outputs of scripts/christmas-models.mjs). */
export const CHRISTMAS_MODEL_PUBLIC_PATH = "/models/christmas";

export function ornamentDesignUrl(design: OrnamentDesignId, lod: OrnamentLod): string {
  return `${CHRISTMAS_MODEL_PUBLIC_PATH}/${design}.${lod}.glb`;
}

/** Model-local bounding radius about the bbox centre (scripts/christmas-models.designs.mjs MODEL_RADIUS, CA6). */
export const ORNAMENT_MODEL_RADIUS = 1;

/** World bounding radius of one ornament. DRAFT lead decision D7 (owner art review): equals the hit-proxy radius. */
export const ORNAMENT_WORLD_RADIUS = TREE_ORNAMENT_HIT_RADIUS;

/** Model-local → world scale of an ornament (CA9 bounds it by half the minimum slot spacing). */
export const ORNAMENT_WORLD_SCALE = ORNAMENT_WORLD_RADIUS / ORNAMENT_MODEL_RADIUS;

/** Where a design's geometry comes from. L17 adds a "procedural" kind. fallbackColor = the design's main (last-rule) colour. */
export type OrnamentDesignSource = Readonly<{ kind: "glb"; fallbackColor: string }>;

/** Design-source registry (MFW-101 / MFW-124): all six designs have a glb; a design without an entry never fetches and shows the fallback sphere. */
export const ORNAMENT_DESIGN_SOURCES: Readonly<Partial<Record<OrnamentDesignId, OrnamentDesignSource>>> = Object.freeze({
  ball_01: Object.freeze({ kind: "glb", fallbackColor: "#E0D4C4" }),
  star_01: Object.freeze({ kind: "glb", fallbackColor: "#D1B271" }),
  bow_01: Object.freeze({ kind: "glb", fallbackColor: "#CE927E" }),
  bell_01: Object.freeze({ kind: "glb", fallbackColor: "#E5CF9A" }),
  stocking_01: Object.freeze({ kind: "glb", fallbackColor: "#D69580" }),
  gift_01: Object.freeze({ kind: "glb", fallbackColor: "#99A48F" }),
});

export function ornamentDesignSource(design: OrnamentDesignId): OrnamentDesignSource | null {
  return ORNAMENT_DESIGN_SOURCES[design] ?? null;
}

/** ORNAMENT_DESIGN_IDS with a glb source, in the same order. */
export const ORNAMENT_GLB_DESIGN_IDS: readonly OrnamentDesignId[] = Object.freeze(
  ORNAMENT_DESIGN_IDS.filter((id) => ornamentDesignSource(id)?.kind === "glb"),
);

/** Tint of the fallback sphere: the design's own source colour, else the ORNAMENT_DEFAULT_DESIGN source colour. */
export function ornamentFallbackColor(design: OrnamentDesignId): string {
  const source = ornamentDesignSource(design) ?? ornamentDesignSource(ORNAMENT_DEFAULT_DESIGN);
  if (source === null) throw new Error(`no design source for the default ornament design ${ORNAMENT_DEFAULT_DESIGN}`);
  return source.fallbackColor;
}

/** The one vertex-colour design-body material per canvas: the same matte spec as the krathong designs (one program). */
export const ORNAMENT_DESIGN_BODY_MATERIAL = KRATHONG_DESIGN_BODY_MATERIAL;

/** Fallback sphere segments (lead decision): 2·width·(height−1) = 80 triangles, within the low guard (OC4). */
export const ORNAMENT_FALLBACK_SPHERE_SEGMENTS = Object.freeze({ width: 8, height: 6 });

/** Design picker thumbnails: static PNGs cropped from the MFW-101 / MFW-124 DAY hero renders by scripts/christmas-model-shots.mjs. */
export const ORNAMENT_DESIGN_THUMBNAIL_PUBLIC_PATH = "/ui/ornament-designs";

export function ornamentDesignThumbnailUrl(design: OrnamentDesignId): string {
  return `${ORNAMENT_DESIGN_THUMBNAIL_PUBLIC_PATH}/${design}.png`;
}

/** PNG edge of a thumbnail (same as the krathong design thumbnails). */
export const ORNAMENT_DESIGN_THUMBNAIL_PX = KRATHONG_DESIGN_THUMBNAIL_PX;

/** Most bytes one thumbnail file may have (same guard as the krathong design thumbnails). */
export const ORNAMENT_DESIGN_THUMBNAIL_MAX_BYTES = KRATHONG_DESIGN_THUMBNAIL_MAX_BYTES;
