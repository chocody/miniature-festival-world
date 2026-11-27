import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_DESIGN_IDS, KRATHONG_DESIGN_MAX_FLAMES } from "@/config/krathongDesigns.config";
import { KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import type { KrathongBatchGeometryKey, KrathongBatchMaterialKey, KrathongBatchRole } from "./types";

/** One draw batch of river krathong parts: every part with this geometry AND this material (backlog 8.2 AC1). */
export interface KrathongInstanceBucket {
  readonly key: string; // krathongInstanceBucketKey(geometryKey, materialKey)
  readonly role: KrathongBatchRole;
  readonly geometryKey: KrathongBatchGeometryKey;
  readonly materialKey: KrathongBatchMaterialKey;
  /** Most parts of this bucket ONE krathong can have; capacity = maxPerKrathong × max krathongs. */
  readonly maxPerKrathong: number;
}

export const KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR = "|";
export function krathongInstanceBucketKey(geometryKey: KrathongBatchGeometryKey, materialKey: KrathongBatchMaterialKey): string {
  return `${geometryKey}${KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR}${materialKey}`;
}

const SINGLE_PART = 1;

function bucket(
  role: KrathongBatchRole,
  geometryKey: KrathongBatchGeometryKey,
  materialKey: KrathongBatchMaterialKey,
  maxPerKrathong: number,
): KrathongInstanceBucket {
  return Object.freeze({ key: krathongInstanceBucketKey(geometryKey, materialKey), role, geometryKey, materialKey, maxPerKrathong });
}

/**
 * Fixed order: bases, leaves (fold × colour), flowers, flower centres, candles, flame, incense, then one body per owner-supplied
 * design (MFW-65, appended so earlier indices stay stable). The index is the batch mesh index. The flame bucket also holds the
 * flames of a design (up to KRATHONG_DESIGN_MAX_FLAMES per krathong).
 */
export const KRATHONG_INSTANCE_BUCKETS: readonly KrathongInstanceBucket[] = Object.freeze([
  ...KRATHONG_BASE_IDS.map((id) => bucket("base", `base:${id}`, `base:${id}`, SINGLE_PART)),
  ...LEAF_FOLD_STYLE_IDS.flatMap((fold) =>
    LEAF_COLOR_PALETTE.map((color) => bucket("leaf", `leaf:${fold}`, `leaf:${color}`, KRATHONG_LEAF_COUNT)),
  ),
  ...FLOWER_KINDS.map((kind) => bucket("flower", `flower:${kind}`, `flower:${kind}`, RIM_SOCKET_COUNT)),
  bucket("flowerCentre", "flowerCentre", "flowerCentre", RIM_SOCKET_COUNT),
  ...CANDLE_COLOR_PALETTE.map((color) => bucket("candle", "candle", `candle:${color}`, SINGLE_PART)),
  bucket("flame", "flame", "flame", Math.max(SINGLE_PART, KRATHONG_DESIGN_MAX_FLAMES)),
  bucket("incense", "incense", "incense", KRATHONG_INCENSE_MODEL.count),
  ...KRATHONG_DESIGN_IDS.map((id) => bucket("designBody", `design:${id}`, "designBody", SINGLE_PART)),
]);
export const KRATHONG_INSTANCE_BUCKET_COUNT = KRATHONG_INSTANCE_BUCKETS.length;

const BUCKET_INDEX: ReadonlyMap<string, number> = new Map(KRATHONG_INSTANCE_BUCKETS.map((b, i) => [b.key, i]));

/** Index into KRATHONG_INSTANCE_BUCKETS, or null for a pair the catalogue does not know. */
export function krathongInstanceBucketIndex(geometryKey: KrathongBatchGeometryKey, materialKey: KrathongBatchMaterialKey): number | null {
  return BUCKET_INDEX.get(krathongInstanceBucketKey(geometryKey, materialKey)) ?? null;
}
