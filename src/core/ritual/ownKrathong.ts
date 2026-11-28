import { ZONE_ITEM_CAP } from "@/config/world.config";
import type { InteractionMode } from "@/core/interaction";
import type { RitualPhase } from "./ritualStateMachine";

/** Where the user's own krathong is drawn (MFW-23). */
export type OwnKrathongPoseKind = "ORIGIN" | "PIER" | "DRAG" | "RELEASING" | "RIVER" | "HIDDEN";
export interface OwnKrathongPoseInput {
  readonly mode: InteractionMode | null;
  readonly phase: RitualPhase;
  readonly hasSaved: boolean;
  readonly dragging: boolean;
  readonly ownZoneVisible: boolean;
}

export function ownKrathongPoseKind(input: OwnKrathongPoseInput): OwnKrathongPoseKind {
  if (input.mode === null || input.mode === "CUSTOMIZE") return "ORIGIN";
  if (input.phase === "RELEASED" && input.hasSaved) return input.ownZoneVisible ? "RIVER" : "HIDDEN";
  if (input.mode === "WORLD_EXPLORE") return "HIDDEN"; // MFW-154: no hero krathong on the landing view
  if (input.phase === "RELEASING") return "RELEASING";
  if (input.dragging) return "DRAG";
  return "PIER";
}

/** True when the own krathong is drawn in the shared scene, so the shared list must reserve its slot (invariant E). ORIGIN is the legacy look-dev pose. */
export function isOwnSlotReserved(kind: OwnKrathongPoseKind): boolean {
  return kind === "PIER" || kind === "DRAG" || kind === "RELEASING" || kind === "RIVER";
}

/** savedZoneId null → false; visibleZoneId null (world not loaded yet) → true; else equality. */
export function isOwnZoneVisible(savedZoneId: number | null, visibleZoneId: number | null): boolean {
  if (savedZoneId === null) return false;
  if (visibleZoneId === null) return true;
  return savedZoneId === visibleZoneId;
}

/** Drops the own id and caps the list so items + own krathong ≤ cap (invariant E). Returns `items` itself when nothing changes. */
export function excludeOwnAndCap<T extends { readonly id: string }>(
  items: readonly T[],
  ownId: string | null,
  ownShown: boolean,
  cap: number = ZONE_ITEM_CAP,
): readonly T[] {
  const limit = ownShown ? cap - 1 : cap;
  const kept = ownId === null ? items : items.filter((i) => i.id !== ownId);
  return kept.length > limit ? kept.slice(0, limit) : kept;
}
