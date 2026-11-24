import type { FestivalEventConfig } from "./types";

export const loyKrathongConfig = {
  id: "loy_krathong",
  name: "Loy Krathong",
  nameTh: "ลอยกระทง",
} as const satisfies FestivalEventConfig;

/** Spec §6.4 Task 4.1 bases; id format follows the §5 example "banana_trunk_01". */
export const KRATHONG_BASE_IDS = ["banana_trunk_01", "lotus_petal_01", "toy_bread_01"] as const;
export type KrathongBaseId = (typeof KRATHONG_BASE_IDS)[number];

/** Banana-leaf fold styles (§5 key `lotusFold`, example "style_02"). Count PLACEHOLDER (spec silent). */
export const LEAF_FOLD_STYLE_IDS = ["style_01", "style_02"] as const;
export type LeafFoldStyleId = (typeof LEAF_FOLD_STYLE_IDS)[number];

/** Banana-leaf colours, canonical uppercase #RRGGBB. PLACEHOLDER values (spec silent). */
export const LEAF_COLOR_PALETTE = ["#5E8C3A", "#8DB255", "#3F6B4A"] as const;
export type LeafColor = (typeof LEAF_COLOR_PALETTE)[number];

/** Spec §6.4 Task 4.1 flowers. */
export const FLOWER_KINDS = ["marigold", "orchid", "lotus"] as const;
export type FlowerKind = (typeof FLOWER_KINDS)[number];

/** Candle colours, canonical uppercase. "#FFD166" is the §5 example; the other two are PLACEHOLDER (spec silent). */
export const CANDLE_COLOR_PALETTE = ["#FFD166", "#FFF1D6", "#FF9F6B"] as const;
export type CandleColor = (typeof CANDLE_COLOR_PALETTE)[number];

/** Spec §6.4: candleAndIncense is constrained to this socket. */
export const CENTER_SOCKET_ID = "center_socket" as const;
/** Rim socket ids are `${RIM_SOCKET_ID_PREFIX}${index}`, index 0..RIM_SOCKET_COUNT-1. */
export const RIM_SOCKET_ID_PREFIX = "rim_socket_" as const;
/** Number of flower sockets around the rim. PLACEHOLDER (spec silent). */
export const RIM_SOCKET_COUNT = 8;

/** Choices for the first krathong a user sees. PLACEHOLDER (spec silent). `flower` fills every rim socket. */
export const DEFAULT_KRATHONG_CHOICES = Object.freeze({
  base: "banana_trunk_01",
  lotusFold: "style_01",
  leafColor: "#5E8C3A",
  flower: "marigold",
  candleColor: "#FFD166",
} as const satisfies {
  base: KrathongBaseId;
  lotusFold: LeafFoldStyleId;
  leafColor: LeafColor;
  flower: FlowerKind;
  candleColor: CandleColor;
});
