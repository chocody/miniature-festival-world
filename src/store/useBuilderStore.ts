import { create } from "zustand";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  DEFAULT_ORNAMENT_APPEARANCE,
  defaultEventAppearance,
  krathongAppearanceEquals,
  parseOrnamentAppearance,
  type AppearanceParseResult,
  type EventAppearance,
  type KrathongAppearance,
  type KrathongChoice,
  type KrathongChoiceResult,
  type OrnamentAppearance,
} from "@/core/customization";
import type { KrathongDesignId } from "@/config/krathongDesigns.config";
import type { FestivalEventId } from "@/config/events/types";
import type { ModerationReason } from "@/services/moderation";
import { moderationReasonsFromServerBody, type ComposedWish } from "@/services/api/wishPayload";
import {
  evaluateWishComposer,
  type WishComposerDraft,
  type WishComposerEvaluation,
} from "@/services/api/wishComposer";

export interface BuilderActions {
  /**
   * Applies one customizer choice to the current appearance (null = DEFAULT_KRATHONG_APPEARANCE).
   * Updates the store only when the result is valid AND different, so a no-op keeps the same reference (no bounce).
   */
  chooseKrathong: (choice: KrathongChoice) => KrathongChoiceResult;
  /**
   * Chooses the design of the creation of an event (MFW-92). loy_krathong behaves exactly like chooseKrathong; christmas
   * stores an ornament design (null = default); any other event is refused. A refusal or a no-op leaves the same state.
   */
  chooseDesign: (eventId: FestivalEventId, design: string) => AppearanceParseResult<EventAppearance>;
  /**
   * Evaluates the composer draft (name always through the 2.3 guard; wish too when the switch is on). Only when ok: stores
   * the composed wish and the trimmed name (null when empty) and clears server reasons. Otherwise the store is untouched
   * (same state reference). MFW-63.
   */
  submitWish: (draft: WishComposerDraft) => WishComposerEvaluation;
  /**
   * Reads an untrusted create-API error body (MFW-45). A moderation_blocked body stores its reasons (the wish is kept,
   * so the modal reopens with the text) and returns true; anything else changes nothing and returns false.
   */
  rejectWishFromServer: (body: unknown) => boolean;
}

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState extends BuilderActions {
  /** The Loy Krathong appearance (null = DEFAULT_KRATHONG_APPEARANCE). */
  appearance: KrathongAppearance | null;
  /** The Christmas ornament appearance (null = DEFAULT_ORNAMENT_APPEARANCE). In memory only (MFW-92). */
  ornamentAppearance: OrnamentAppearance | null;
  /** The composed wish of this creation. In memory only (never persisted); MFW-23 sends it when saving. */
  wish: ComposedWish | null;
  /** The optional display name of this creation (MFW-63). In memory only (never persisted); cleared with `wish` after a save. */
  wishDisplayName: string | null;
  /** Reasons the server gave for refusing the public wish; null when none. */
  wishServerReasons: readonly ModerationReason[] | null;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  appearance: null,
  ornamentAppearance: null,
  wish: null,
  wishDisplayName: null,
  wishServerReasons: null,
  chooseKrathong: (choice) => {
    const current = get().appearance ?? DEFAULT_KRATHONG_APPEARANCE;
    const result = applyKrathongChoice(current, choice);
    if (result.ok && !krathongAppearanceEquals(result.appearance, current)) set({ appearance: result.appearance });
    return result;
  },
  chooseDesign: (eventId, design) => {
    if (eventId === "loy_krathong") return get().chooseKrathong({ part: "design", value: design as KrathongDesignId });
    if (eventId === "christmas") {
      const parsed = parseOrnamentAppearance({ design });
      if (parsed.ok && parsed.appearance.design !== (get().ornamentAppearance ?? DEFAULT_ORNAMENT_APPEARANCE).design) {
        set({ ornamentAppearance: parsed.appearance });
      }
      return parsed;
    }
    return { ok: false, reason: `no appearance schema for event: ${eventId}` };
  },
  submitWish: (draft) => {
    const result = evaluateWishComposer(draft);
    if (result.ok) set({ wish: result.wish, wishDisplayName: result.displayName, wishServerReasons: null });
    return result;
  },
  rejectWishFromServer: (body) => {
    const reasons = moderationReasonsFromServerBody(body);
    if (reasons === null) return false;
    set({ wishServerReasons: reasons });
    return true;
  },
}));

/** The appearance being built for an event (the event default when none is chosen), or null for an event without a schema. */
export function selectBuilderAppearance(
  state: Pick<BuilderState, "appearance" | "ornamentAppearance">,
  eventId: FestivalEventId,
): EventAppearance | null {
  if (eventId === "loy_krathong") return state.appearance ?? defaultEventAppearance("loy_krathong");
  if (eventId === "christmas") return state.ornamentAppearance ?? defaultEventAppearance("christmas");
  return null;
}
