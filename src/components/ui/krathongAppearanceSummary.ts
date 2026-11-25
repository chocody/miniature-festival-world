import {
  CANDLE_COLOR_LABELS,
  CUSTOMIZER_COPY,
  FLOWER_KIND_LABELS,
  KRATHONG_BASE_LABELS,
  LEAF_COLOR_LABELS,
  LEAF_FOLD_STYLE_LABELS,
  NO_FLOWER_LABEL,
} from "@/config/customizer.config";
import { FLOWER_KINDS } from "@/config/events/loyKrathong.config";
import { INSPECT_POPUP_COPY } from "@/config/inspect.config";
import type { KrathongAppearance } from "@/core/customization/types";

export type AppearanceSummaryKey = "base" | "lotusFold" | "leafColor" | "flowers" | "candleColor";
export interface AppearanceSummaryRow {
  readonly key: AppearanceSummaryKey;
  readonly label: string;
  readonly value: string;
  /** "#rrggbb" from the palette for colour rows, else null. */
  readonly swatch: string | null;
}

function lookup(map: Readonly<Record<string, string>>, value: unknown): string | null {
  return typeof value === "string" && Object.hasOwn(map, value) ? map[value] : null;
}

function describeFlowers(flowers: KrathongAppearance["flowers"]): string {
  const parts: string[] = [];
  for (const kind of FLOWER_KINDS) {
    let n = 0;
    for (const f of flowers) if (f === kind) n++;
    if (n > 0) parts.push(`${FLOWER_KIND_LABELS[kind]} ${INSPECT_POPUP_COPY.flowerCountPrefix}${n}`);
  }
  return parts.length > 0 ? parts.join(INSPECT_POPUP_COPY.flowerListSeparator) : NO_FLOWER_LABEL;
}

/** Thai rows in this order: base, lotusFold, leafColor, flowers, candleColor. */
export function describeKrathongAppearance(appearance: KrathongAppearance): readonly AppearanceSummaryRow[] {
  const unknown = INSPECT_POPUP_COPY.unknownPart;
  const leaf = lookup(LEAF_COLOR_LABELS, appearance.leafColor);
  const candle = lookup(CANDLE_COLOR_LABELS, appearance.candleColor);
  return [
    { key: "base", label: CUSTOMIZER_COPY.baseGroupLabel, value: lookup(KRATHONG_BASE_LABELS, appearance.base) ?? unknown, swatch: null },
    { key: "lotusFold", label: CUSTOMIZER_COPY.foldGroupLabel, value: lookup(LEAF_FOLD_STYLE_LABELS, appearance.lotusFold) ?? unknown, swatch: null },
    { key: "leafColor", label: CUSTOMIZER_COPY.leafColorGroupLabel, value: leaf ?? unknown, swatch: leaf === null ? null : appearance.leafColor },
    { key: "flowers", label: CUSTOMIZER_COPY.flowerGroupLabel, value: describeFlowers(appearance.flowers), swatch: null },
    { key: "candleColor", label: CUSTOMIZER_COPY.candleColorGroupLabel, value: candle ?? unknown, swatch: candle === null ? null : appearance.candleColor },
  ];
}
