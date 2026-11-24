import { create } from "zustand";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  krathongAppearanceEquals,
  type EventAppearance,
  type KrathongChoice,
  type KrathongChoiceResult,
} from "@/core/customization";
import type { ModerationReason } from "@/services/moderation";
import {
  evaluateWishDraft,
  moderationReasonsFromServerBody,
  type ComposedWish,
  type WishDraft,
  type WishDraftEvaluation,
} from "@/services/api/wishPayload";

export interface BuilderActions {
  /**
   * Applies one customizer choice to the current appearance (null = DEFAULT_KRATHONG_APPEARANCE).
   * Updates the store only when the result is valid AND different, so a no-op keeps the same reference (no bounce).
   */
  chooseKrathong: (choice: KrathongChoice) => KrathongChoiceResult;
  /**
   * Evaluates the draft (2.3 guard when public). Only when ok: stores the composed wish and clears server reasons.
   * Otherwise the store is untouched (same state reference).
   */
  submitWish: (draft: WishDraft) => WishDraftEvaluation;
  /**
   * Reads an untrusted create-API error body (MFW-45). A moderation_blocked body stores its reasons (the wish is kept,
   * so the modal reopens with the text) and returns true; anything else changes nothing and returns false.
   */
  rejectWishFromServer: (body: unknown) => boolean;
}

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState extends BuilderActions {
  appearance: EventAppearance | null;
  /** The composed wish of this creation. In memory only (never persisted); MFW-23 sends it when saving. */
  wish: ComposedWish | null;
  /** Reasons the server gave for refusing the public wish; null when none. */
  wishServerReasons: readonly ModerationReason[] | null;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  appearance: null,
  wish: null,
  wishServerReasons: null,
  chooseKrathong: (choice) => {
    const current = get().appearance ?? DEFAULT_KRATHONG_APPEARANCE;
    const result = applyKrathongChoice(current, choice);
    if (result.ok && !krathongAppearanceEquals(result.appearance, current)) set({ appearance: result.appearance });
    return result;
  },
  submitWish: (draft) => {
    const result = evaluateWishDraft(draft);
    if (result.ok) set({ wish: result.wish, wishServerReasons: null });
    return result;
  },
  rejectWishFromServer: (body) => {
    const reasons = moderationReasonsFromServerBody(body);
    if (reasons === null) return false;
    set({ wishServerReasons: reasons });
    return true;
  },
}));
