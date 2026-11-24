import { create } from "zustand";
import type { EventAppearance } from "@/core/customization";

/** The creation currently being customized (spec §3: useBuilderStore). */
export interface BuilderState {
  appearance: EventAppearance | null;
}

export const useBuilderStore = create<BuilderState>()(() => ({
  appearance: null,
}));
