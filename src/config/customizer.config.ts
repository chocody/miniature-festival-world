import type {
  CandleColor, FlowerKind, KrathongBaseId, LeafColor, LeafFoldStyleId,
} from "@/config/events/loyKrathong.config";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";

/** Part names from spec §6.4 Task 4.1 (ฐานหยวกกล้วย / ฐานกลีบบัว / ฐานขนมปังสไตล์ของเล่น). */
export const KRATHONG_BASE_LABELS: Readonly<Record<KrathongBaseId, string>> = Object.freeze({
  banana_trunk_01: "หยวกกล้วย",
  lotus_petal_01: "กลีบบัว",
  toy_bread_01: "ขนมปัง",
});
/** PLACEHOLDER copy (spec silent; follows MFW-19's placeholder styles: style_01 pointed, style_02 rounded). */
export const LEAF_FOLD_STYLE_LABELS: Readonly<Record<LeafFoldStyleId, string>> = Object.freeze({
  style_01: "พับแหลม",
  style_02: "พับมน",
});
/** PLACEHOLDER copy for MFW-19's placeholder palette (spec silent). */
export const LEAF_COLOR_LABELS: Readonly<Record<LeafColor, string>> = Object.freeze({
  "#5E8C3A": "เขียวใบตอง",
  "#8DB255": "เขียวอ่อน",
  "#3F6B4A": "เขียวเข้ม",
});
/** Flower names from spec §6.4 Task 4.1 (ดอกดาวเรือง ดอกกล้วยไม้ ดอกบัว). */
export const FLOWER_KIND_LABELS: Readonly<Record<FlowerKind, string>> = Object.freeze({
  marigold: "ดาวเรือง",
  orchid: "กล้วยไม้",
  lotus: "ดอกบัว",
});
/** PLACEHOLDER copy for MFW-19's candle palette (spec silent). */
export const CANDLE_COLOR_LABELS: Readonly<Record<CandleColor, string>> = Object.freeze({
  "#FFD166": "เหลืองทอง",
  "#FFF1D6": "ขาวนวล",
  "#FF9F6B": "ส้มอ่อน",
});
export const NO_FLOWER_LABEL = "ไม่ใส่";
/**
 * MFW-78: names of the five owner-supplied designs. PLACEHOLDER copy (spec silent); accessible names only, never shown (the
 * picker shows thumbnails only).
 */
export const KRATHONG_DESIGN_LABELS: Readonly<Record<KrathongDesignId, string>> = Object.freeze({
  banana_leaf_01: "กระทงใบตอง",
  lotus_bud_01: "กระทงบัวตูม",
  marigold_01: "กระทงดาวเรือง",
  rose_candles_01: "กระทงกุหลาบ",
  naga_01: "กระทงพญานาค",
});

export const CUSTOMIZER_COPY = Object.freeze({
  panelLabel: "แต่งกระทง",
  /** MFW-78: accessible name of the design picker row (never shown). */
  designGroupLabel: "แบบกระทง",
  baseGroupLabel: "ฐานกระทง",
  foldGroupLabel: "แบบพับใบตอง",
  leafColorGroupLabel: "สีใบตอง",
  flowerGroupLabel: "ดอกไม้รอบขอบ",
  candleColorGroupLabel: "สีเทียน",
  viewGroupLabel: "มุมมอง",
  rotateLeft: "หมุนซ้าย",
  rotateRight: "หมุนขวา",
  zoomIn: "ซูมเข้า",
  zoomOut: "ซูมออก",
  /** Same label as the other flow steps; e2e and FlowRoot tests click it by this name. */
  done: "ถัดไป",
  /** Moved verbatim from FlowStepPlaceholder (MFW-16). */
  gestureHint: "ลากเพื่อหมุนกระทง ใช้สองนิ้วเพื่อซูม",
});

/**
 * Part-change bounce: the krathong scale jumps to `fromScale` and springs back to `restScale` with an
 * under-damped spring. With these values (damping ratio ≈ 0.29) the overshoot is ≈ 4 % and it settles in ≈ 0.8 s.
 * fromScale / tension / friction: PLACEHOLDER (spec silent: "แอนิเมชันเด้งเบาๆ"). restScale 1 = the model's own size.
 */
export const PART_CHANGE_BOUNCE = Object.freeze({
  restScale: 1,
  fromScale: 0.9,
  spring: Object.freeze({ mass: 1, tension: 300, friction: 10 }),
});

/** Minimum touch target edge (WCAG 2.5.5 / Apple HIG 44 pt). Tailwind `min-h-11 min-w-11` = 2.75rem = 44 px. Lead decision. */
export const MIN_TOUCH_TARGET_PX = 44;
/** Narrowest supported screen width (backlog 4.2 AC3). */
export const CUSTOMIZER_MIN_WIDTH_PX = 360;
