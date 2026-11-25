import type { KrathongAppearance } from "@/core/customization/types"; // type-only: the barrel pulls in three

/** The ONLY data the InspectPopup gets (invariant C): no owner token/hash, no private wish, no zone/time, no name. */
export interface InspectedCreation {
  readonly id: string; // for the report request only; never displayed
  readonly appearance: KrathongAppearance;
  readonly publicWishText: string | null;
}

/** Structural source (RiverFlowItem fits). */
export interface InspectableSource {
  readonly id: string;
  readonly appearance: KrathongAppearance;
  readonly publicWishText?: string | null;
}

/** Explicit allowlist copy. publicWishText: a string with non-whitespace content → that string (unchanged); anything else → null. */
export function pickInspectedCreation(source: InspectableSource): InspectedCreation {
  const wish = source.publicWishText;
  return {
    id: source.id,
    appearance: source.appearance,
    publicWishText: typeof wish === "string" && wish.trim() !== "" ? wish : null,
  };
}

/** Linear search (≤ ZONE_ITEM_CAP items); null when the id is not in the list (e.g. after a zone switch). */
export function findInspectedCreation(items: readonly InspectableSource[], id: string): InspectedCreation | null {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return pickInspectedCreation(items[i]);
  }
  return null;
}
