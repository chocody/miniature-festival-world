import { create } from "zustand";
import {
  applyKrathongChoice,
  DEFAULT_KRATHONG_APPEARANCE,
  krathongAppearanceEquals,
  type EventAppearance,
  type KrathongChoice,
  type KrathongChoiceResult,
} from "@/core/customization";

export interface BuilderActions {
  /**
   * Applies one customizer choice to the current appearance (null = DEFAULT_KRATHONG_APPEARANCE).
   * Updates the store only when the result is valid AND different, so a no-op keeps the same reference (no bounce).
   */
  chooseKrathong: (choice: KrathongChoice) => KrathongChoiceResult;
}

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState extends BuilderActions {
  appearance: EventAppearance | null;
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  appearance: null,
  chooseKrathong: (choice) => {
    const current = get().appearance ?? DEFAULT_KRATHONG_APPEARANCE;
    const result = applyKrathongChoice(current, choice);
    if (result.ok && !krathongAppearanceEquals(result.appearance, current)) set({ appearance: result.appearance });
    return result;
  },
}));
