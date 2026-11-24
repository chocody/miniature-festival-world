import {
  CANDLE_COLOR_PALETTE,
  FLOWER_KINDS,
  KRATHONG_BASE_IDS,
  LEAF_COLOR_PALETTE,
  LEAF_FOLD_STYLE_IDS,
} from "@/config/events/loyKrathong.config";
import {
  KRATHONG_BASE_MODELS,
  KRATHONG_CANDLE_MODEL,
  KRATHONG_FLAME_MODEL,
  KRATHONG_FLOWER_MODELS,
  KRATHONG_INCENSE_MODEL,
  KRATHONG_LEAF_MODELS,
  KRATHONG_MATTE_SURFACE,
  type MatteMaterialSpec,
  type PrimitiveGeometrySpec,
} from "@/config/krathongModel.config";
import type { KrathongGeometryKey, KrathongMaterialKey } from "./types";

export const KRATHONG_GEOMETRY_KEYS: readonly KrathongGeometryKey[] = Object.freeze([
  ...KRATHONG_BASE_IDS.map((id) => `base:${id}` as const),
  ...LEAF_FOLD_STYLE_IDS.map((id) => `leaf:${id}` as const),
  ...FLOWER_KINDS.map((kind) => `flower:${kind}` as const),
  "candle" as const,
  "flame" as const,
  "incense" as const,
]);

export const KRATHONG_MATERIAL_KEYS: readonly KrathongMaterialKey[] = Object.freeze([
  ...KRATHONG_BASE_IDS.map((id) => `base:${id}` as const),
  ...LEAF_COLOR_PALETTE.map((color) => `leaf:${color}` as const),
  ...FLOWER_KINDS.map((kind) => `flower:${kind}` as const),
  ...CANDLE_COLOR_PALETTE.map((color) => `candle:${color}` as const),
  "flame" as const,
  "incense" as const,
]);

function splitKey(key: string): [string, string | undefined] {
  const [head, tail, ...rest] = key.split(":");
  return rest.length > 0 ? [head, undefined] : [head, tail];
}

function has(list: readonly string[], value: string | undefined): value is string {
  return value !== undefined && list.includes(value);
}

export function geometrySpecFor(key: KrathongGeometryKey): PrimitiveGeometrySpec {
  const [head, tail] = splitKey(key);
  if (tail === undefined) {
    if (head === "candle") return KRATHONG_CANDLE_MODEL.geometry;
    if (head === "flame") return KRATHONG_FLAME_MODEL.geometry;
    if (head === "incense") return KRATHONG_INCENSE_MODEL.geometry;
  } else if (head === "base" && has(KRATHONG_BASE_IDS, tail)) {
    return KRATHONG_BASE_MODELS[tail as keyof typeof KRATHONG_BASE_MODELS].geometry;
  } else if (head === "leaf" && has(LEAF_FOLD_STYLE_IDS, tail)) {
    return KRATHONG_LEAF_MODELS[tail as keyof typeof KRATHONG_LEAF_MODELS].geometry;
  } else if (head === "flower" && has(FLOWER_KINDS, tail)) {
    return KRATHONG_FLOWER_MODELS[tail as keyof typeof KRATHONG_FLOWER_MODELS].geometry;
  }
  throw new Error(`unknown krathong geometry key: ${key}`);
}

export function materialSpecFor(key: KrathongMaterialKey): MatteMaterialSpec {
  const [head, tail] = splitKey(key);
  const matte = (color: string): MatteMaterialSpec => ({ ...KRATHONG_MATTE_SURFACE, color });
  if (tail === undefined) {
    if (head === "flame") {
      return {
        ...matte(KRATHONG_FLAME_MODEL.color),
        emissive: KRATHONG_FLAME_MODEL.emissive,
        emissiveIntensity: KRATHONG_FLAME_MODEL.emissiveIntensity,
      };
    }
    if (head === "incense") return matte(KRATHONG_INCENSE_MODEL.color);
  } else if (head === "base" && has(KRATHONG_BASE_IDS, tail)) {
    return matte(KRATHONG_BASE_MODELS[tail as keyof typeof KRATHONG_BASE_MODELS].color);
  } else if (head === "leaf" && has(LEAF_COLOR_PALETTE, tail)) {
    return matte(tail);
  } else if (head === "flower" && has(FLOWER_KINDS, tail)) {
    return matte(KRATHONG_FLOWER_MODELS[tail as keyof typeof KRATHONG_FLOWER_MODELS].color);
  } else if (head === "candle" && has(CANDLE_COLOR_PALETTE, tail)) {
    return matte(tail);
  }
  throw new Error(`unknown krathong material key: ${key}`);
}
