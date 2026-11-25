import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
  RIM_SOCKET_COUNT,
} from "@/config/events/loyKrathong.config";
import { KRATHONG_INCENSE_MODEL, KRATHONG_LEAF_COUNT } from "@/config/krathongModel.config";
import type { KrathongGeometryKey, KrathongMaterialKey, KrathongPartRole } from "./types";

/** One draw batch of river krathong parts: every part with this geometry AND this material (backlog 8.2 AC1). */
export interface KrathongInstanceBucket {
  readonly key: string; // krathongInstanceBucketKey(geometryKey, materialKey)
  readonly role: KrathongPartRole;
  readonly geometryKey: KrathongGeometryKey;
  readonly materialKey: KrathongMaterialKey;
  /** Most parts of this bucket ONE krathong can have; capacity = maxPerKrathong × max krathongs. */
  readonly maxPerKrathong: number;
}

export const KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR = "|";
export function krathongInstanceBucketKey(geometryKey: KrathongGeometryKey, materialKey: KrathongMaterialKey): string {
  return `${geometryKey}${KRATHONG_INSTANCE_BUCKET_KEY_SEPARATOR}${materialKey}`;
}

const SINGLE_PART = 1;

function bucket(
  role: KrathongPartRole,
  geometryKey: KrathongGeometryKey,
  materialKey: KrathongMaterialKey,
  maxPerKrathong: number,
): KrathongInstanceBucket {
  return Object.freeze({ key: krathongInstanceBucketKey(geometryKey, materialKey), role, geometryKey, materialKey, maxPerKrathong });
}

/** Fixed order: bases, leaves (fold × colour), flowers, flower centres, candles, flame, incense. The index is the batch mesh index. */
export const KRATHONG_INSTANCE_BUCKETS: readonly KrathongInstanceBucket[] = Object.freeze([
  ...KRATHONG_BASE_IDS.map((id) => bucket("base", `base:${id}`, `base:${id}`, SINGLE_PART)),
  ...LEAF_FOLD_STYLE_IDS.flatMap((fold) =>
    LEAF_COLOR_PALETTE.map((color) => bucket("leaf", `leaf:${fold}`, `leaf:${color}`, KRATHONG_LEAF_COUNT)),
  ),
  ...FLOWER_KINDS.map((kind) => bucket("flower", `flower:${kind}`, `flower:${kind}`, RIM_SOCKET_COUNT)),
  bucket("flowerCentre", "flowerCentre", "flowerCentre", RIM_SOCKET_COUNT),
  ...CANDLE_COLOR_PALETTE.map((color) => bucket("candle", "candle", `candle:${color}`, SINGLE_PART)),
  bucket("flame", "flame", "flame", SINGLE_PART),
  bucket("incense", "incense", "incense", KRATHONG_INCENSE_MODEL.count),
]);
export const KRATHONG_INSTANCE_BUCKET_COUNT = KRATHONG_INSTANCE_BUCKETS.length;

const BUCKET_INDEX: ReadonlyMap<string, number> = new Map(KRATHONG_INSTANCE_BUCKETS.map((b, i) => [b.key, i]));

/** Index into KRATHONG_INSTANCE_BUCKETS, or null for a pair the catalogue does not know. */
export function krathongInstanceBucketIndex(geometryKey: KrathongGeometryKey, materialKey: KrathongMaterialKey): number | null {
  return BUCKET_INDEX.get(krathongInstanceBucketKey(geometryKey, materialKey)) ?? null;
}
